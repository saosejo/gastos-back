// routes/userRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const List = require('../models/list'); // Import the User model
const Expense = require('../models/expense'); // Import the User model
const User = require('../models/user');
const Recurrence = require('../models/recurrence');
const Category = require('../models/category');
const { authMiddleware, signToken }  = require('../service/authMiddleware');
const moment = require('moment');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post("/createList", authMiddleware, async (req, res) => {
  try {
    const listReq = req.body;
    const userId = req.user; // Get user ID from middleware

    // 🛠 Handle Recurrence (Create or Use Existing)
    let recurrenceId = listReq.recurrence;

    if (listReq.recurrence && typeof listReq.recurrence === "object") {
      const newRecurrence = new Recurrence({
        type: listReq.recurrence.type,
        period: listReq.recurrence.period,
        interval: listReq.recurrence.interval,
        startDate: listReq.recurrence.startDate,
        endDate: listReq.recurrence.endDate,
      });

      const savedRecurrence = await newRecurrence.save();
      recurrenceId = savedRecurrence._id;
    }

    // 🛠 Handle Categories: Convert Category Objects into Category IDs
    const categoryIds = await Promise.all(
      listReq.categories.map(async (category) => {
        if (category._id) {
          // If category already exists, use its ID
          return category._id;
        }

        // If category is new, create it in DB
        const newCategory = new Category({
          name: category.name,
          budget: category.budget || 0,
        });

        const savedCategory = await newCategory.save();
        return savedCategory._id; // Return the new category ID
      })
    );

    // 🛠 Create & Save List
    const list = new List({
      name: listReq.name,
      budget: listReq.budget,
      categories: categoryIds, // Store only IDs
      recurrence: recurrenceId,
      createdBy: userId,
    });

    await list.save();

    // Send the created list as a response
    res.status(201).send(list);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "An error occurred while creating the list." });
  }
});

router.get('/getlists/:userId', authMiddleware, async (req, res) => {
  const userId = req.user;
  const { date } = req.query; // Get the date parameter from query string

  try {
    // Fetch lists along with recurrence and expenses
    const lists = await List.find({
      $or: [{ createdBy: userId }, { sharedWith: userId }]
    })
      .populate('createdBy')
      .populate('sharedWith')
      .populate({
        path: 'recurrence'
      }) // Include recurrence details
      .populate({
        path: 'expenses',
        populate: [
          { path: 'createdBy', model: 'User' }, // Populate createdBy in Expense
          { path: 'category', model: 'Category' } // Populate category in Expense
        ]
      })
      .populate('categories');

    // Remove backend filtering by period/concurrency
    // Always return all expenses for each list
    // The frontend will handle filtering by period if needed
    res.send(lists);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).send({ message: 'Error fetching lists', error });
  }
});

router.post('/lists/:listId/share', authMiddleware, async (req, res) => {
  try {
    const { listId } = req.params;
    const { userId } = req.body; // `userId` now contains the email

    // Find the user by email (passed in `userId`)
    const user = await User.findOne({ email: userId });
    if (!user) {
      return res.status(404).send({ error: 'User with this email not found.' });
    }

    // Update the list's sharedWith array
    const list = await List.findByIdAndUpdate(
      listId,
      { $addToSet: { sharedWith: user._id } }, // Avoid duplicates
      { new: true }
    ).populate('sharedWith', 'email name'); // Populate sharedWith with user details for confirmation

    if (!list) {
      return res.status(404).send({ error: 'List not found.' });
    }

    // Optionally add the list to the user's sharedLists array
    await User.findByIdAndUpdate(
      user._id,
      { $addToSet: { sharedLists: listId } }, // Avoid duplicates
      { new: true }
    );

    res.status(200).send(list);
  } catch (error) {
    console.error('Error sharing the list:', error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});


router.post('/expenses', authMiddleware, async (req, res) => {
  const expenseReq = req.body;
  const userId = req.user;

  try {
    // Find the list to which the expense belongs
    const listSearch = await List.findById(expenseReq.listId).populate('categories');
    if (!listSearch) {
        return res.status(404).send({ message: 'List not found' });
    }

    // Find the category ID by matching the category name in the list's categories
    const category = listSearch.categories.find(cat => cat.name === expenseReq.category.name);
    if (!category) {
        return res.status(400).send({ message: 'Category not found in the list' });
    }

    // Create the expense with the category ID
    const expense = new Expense({
        description: expenseReq.description,
        amount: parseFloat(expenseReq.amount),
        date: expenseReq.date ? new Date(expenseReq.date + 'T12:00:00.000Z') : new Date(),
        listId: listSearch._id,
        createdBy: userId,
        category: category._id, // Use the found category ID
    });

    // Save the expense
    await expense.save();

    // Add the expense ID to the list's expenses array
    listSearch.expenses.push(expense._id);
    await listSearch.save();

    // Populate the category and createdBy fields in the expense document
    const populatedExpense = await Expense.findById(expense._id)
    .populate('category') // Populate the category field
    .populate('createdBy'); // Populate the createdBy field

    // Send the populated expense as the response
    res.status(201).send(populatedExpense);  
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

router.get('/expenses/:listId', authMiddleware, async (req, res) => {
    const { listId } = req.params;
    if(listId == null || listId === 'undefined') return res.status(400).send({ message: 'Invalid listId' });
    const expenses = await Expense.find({ listId });
    res.send(expenses);
});

// Delete an expense from a list
router.delete('/expenses/:expenseId', authMiddleware, async (req, res) => {
  try {
    const { expenseId } = req.params;
    const userId = req.user;

    // Find the expense and populate the list to check ownership
    const expense = await Expense.findById(expenseId).populate('listId');
    
    if (!expense) {
      return res.status(404).send({ message: 'Expense not found' });
    }

    // Check if the user has permission to delete this expense
    // User can delete if they created the expense or if they own the list
    if (expense.createdBy.toString() !== userId && 
        expense.listId.createdBy.toString() !== userId &&
        !expense.listId.sharedWith.includes(userId)) {
      return res.status(403).send({ message: 'Access denied' });
    }

    // Remove the expense ID from the list's expenses array
    await List.findByIdAndUpdate(
      expense.listId._id,
      { $pull: { expenses: expenseId } }
    );

    // Delete the expense
    await Expense.findByIdAndDelete(expenseId);

    res.status(200).send({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

// Update an expense
router.put('/expenses/:expenseId', authMiddleware, async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { description, amount, category, date } = req.body;
    const userId = req.user;

    // Validate input
    if (!description || !amount || !category || !date) {
      return res.status(400).send({ message: 'All fields are required' });
    }

    // Find the expense and populate the list to check ownership
    const expense = await Expense.findById(expenseId).populate('listId');
    
    if (!expense) {
      return res.status(404).send({ message: 'Expense not found' });
    }

    // Check if the user has permission to update this expense
    // User can update if they created the expense or if they own the list
    if (expense.createdBy.toString() !== userId && 
        expense.listId.createdBy.toString() !== userId &&
        !expense.listId.sharedWith.includes(userId)) {
      return res.status(403).send({ message: 'Access denied' });
    }

    // Find the category ID by matching the category name in the list's categories
    const list = await List.findById(expense.listId._id).populate('categories');
    const categoryObj = list.categories.find(cat => cat.name === category.name);
    if (!categoryObj) {
      return res.status(400).send({ message: 'Category not found in the list' });
    }

    // Update the expense
    const updatedExpense = await Expense.findByIdAndUpdate(
      expenseId,
      {
        description: description.trim(),
        amount: parseFloat(amount),
        category: categoryObj._id,
        date: new Date(date + 'T12:00:00.000Z')
      },
      { new: true }
    ).populate('category').populate('createdBy');

    res.status(200).send(updatedExpense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});
 
router.put('/lists/:listId/categories', authMiddleware, async (req, res) => {
    const { listId } = req.params;
    const { categories } = req.body;
    const list = await List.findByIdAndUpdate(
      listId,
      { categories },
      { new: true }
    );
    res.send(list);
});

// Add a new category to a specific list
router.post('/lists/:listId/categories', authMiddleware, async (req, res) => {
  try {
    const { listId } = req.params;
    const category = req.body.category;
    const userId = req.user;

    // Validate input
    if (!category.name) {
      return res.status(400).send({ message: 'Category name and budget are required' });
    }

    // Verify the list exists and belongs to the user
    const list = await List.findOne({
      _id: listId,
      $or: [{ createdBy: userId }, { sharedWith: userId }]
    }).populate('categories');

    if (!list) {
      return res.status(404).send({ message: 'List not found or access denied' });
    }

    // Check if category with same name already exists in this list
    const existingCategory = list.categories.find(cat => cat.name === category.name);
    if (existingCategory) {
      return res.status(400).send({ message: 'Category with this name already exists in the list' });
    }

    // Create new category
    const newCategory = new Category(category);

    const savedCategory = await newCategory.save();

    // Add category to list
    list.categories.push(savedCategory._id);
    await list.save();

    // Return the created category
    res.status(201).send(savedCategory);
  } catch (error) {
    console.error('Error adding category:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

// Delete a category from a list
router.delete('/lists/:listId/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    const { listId, categoryId } = req.params;
    const userId = req.user;

    // Verify the list exists and belongs to the user
    const list = await List.findOne({
      _id: listId,
      $or: [{ createdBy: userId }, { sharedWith: userId }]
    });

    if (!list) {
      return res.status(404).send({ message: 'List not found or access denied' });
    }

    // Check if category exists in MongoDB (not just in the list)
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).send({ message: 'Category not found' });
    }

    // Check if category exists in the list's categories array
    if (!list.categories.includes(categoryId)) {
      return res.status(400).send({ message: 'Category not associated with this list' });
    }

    // Remove category from list
    list.categories.pull(categoryId);
    await list.save();

    // Delete all expenses associated with this category in this list
    await Expense.deleteMany({ 
      listId: list._id,
      category: categoryId 
    });

    // Delete the category itself (only if not used in other lists)
    const isUsedInOtherLists = await List.exists({ 
      _id: { $ne: listId }, 
      categories: categoryId 
    });

    if (!isUsedInOtherLists) {
      await Category.findByIdAndDelete(categoryId);
    }

    res.status(200).send({ 
      message: 'Category removed from list successfully',
      categoryDeleted: !isUsedInOtherLists
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

// Update a category in a list
router.put('/lists/:listId/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    const { listId, categoryId } = req.params;
    const { name, budget } = req.body;
    const userId = req.user;

    // Validate input
    if (!name || budget === undefined) {
      return res.status(400).send({ message: 'Category name and budget are required' });
    }

    // Verify the list exists and belongs to the user
    const list = await List.findOne({
      _id: listId,
      $or: [{ createdBy: userId }, { sharedWith: userId }]
    });

    if (!list) {
      return res.status(404).send({ message: 'List not found or access denied' });
    }

    // Check if category exists in MongoDB
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).send({ message: 'Category not found' });
    }

    // Check if category exists in the list's categories array
    if (!list.categories.includes(categoryId)) {
      return res.status(400).send({ message: 'Category not associated with this list' });
    }

    // Check if new name conflicts with existing categories in this list
    const existingCategory = list.categories.find(cat => 
      cat.toString() !== categoryId && cat.name === name
    );
    if (existingCategory) {
      return res.status(400).send({ message: 'Category with this name already exists in the list' });
    }

    // Update the category
    const updatedCategory = await Category.findByIdAndUpdate(
      categoryId,
      { name, budget },
      { new: true }
    );

    res.status(200).send(updatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

router.post('/auth/google/callback', async (req, res) => {
  const { code, redirect_uri } = req.body;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type: 'authorization_code'
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return res.status(400).json({ message: 'Failed to get access token from Google' });
  }

  // Get user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profile = await userRes.json();

  // Find or create user in your DB
  let user = await User.findOne({ email: profile.email });
  if (!user) {
    const newUser = new User({ email: profile.email});
    await newUser.save();
  }
  // Create JWT Token
  const token = signToken(user); 

  res.json({ user, token });
});

module.exports = router;