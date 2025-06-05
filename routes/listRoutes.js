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

    // Filter expenses based on recurrence
    const filteredLists = lists.map((list) => {
      if ( list.recurrence.type === 'One-time') {
        // For One-time recurrence, include all expenses
        return list;
      }

      const { period, interval } = list.recurrence;
      const now = moment(); // Current date for comparison
      var startRange; var endRange;

      // Define the date range based on the recurrence period and startDate
      switch (period) {
        case 'daily':     
          // Default to the current day
          startRange = now.clone().startOf('day');
          endRange = now.clone().endOf('day');
          break;

        case 'weekly':  
            // Default to the current week
            startRange = now.clone().startOf('week');
            endRange = now.clone().endOf('week');
          break;

        case 'monthly':
            // Default to the current month
            startRange = now.clone().startOf('month');
            endRange = now.clone().endOf('month');
          break;
        case 'yearly':
            // Default to the current year
            startRange = now.clone().startOf('year');
            endRange = now.clone().endOf('year');
          break;

        case 'custom':
          if (interval) {
            startRange = now.clone().startOf('day');
            endRange = startRange.clone().add(6, 'days').endOf('day'); // A week spans 7 days
          } else {
            // If no custom range is provided, skip filtering
            startRange = moment().startOf('day');
            endRange = moment().endOf('day');
          }
          break;

        default:
          // If no valid period, return the list as is
          return list;
      }

      // Filter expenses based on the defined range
      const filteredExpenses = list.expenses.filter((expense) => {
        const expenseDate = moment(expense.date);
        return expenseDate.isBetween(startRange, endRange, 'day', '[]'); // Inclusive range
      });

      // Replace expenses with the filtered ones
      return {
        ...list._doc,
        expenses: filteredExpenses
      };
    });

    res.send(filteredLists);
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
        name: expenseReq.name,
        amount: parseFloat(expenseReq.amount),
        date: expenseReq.date ? new Date(expenseReq.date) : new Date(),
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