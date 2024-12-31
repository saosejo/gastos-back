// routes/userRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const List = require('../models/list'); // Import the User model
const Expense = require('../models/expense'); // Import the User model
const User = require('../models/user');
const Recurrence = require('../models/recurrence');
const { authMiddleware }  = require('../service/authMiddleware');

const router = express.Router();

router.post('/createList', authMiddleware, async (req, res) => {
  try {
    const listReq = req.body;
    const userId = req.user; // Get user ID from the middleware

    // Handle Recurrence
    let recurrenceId = listReq.recurrence; // Recurrence can either be an ID or a new recurrence object

    if (listReq.recurrence && typeof listReq.recurrence === 'object') {
      // If the recurrence is provided as an object, create a new Recurrence document
      const newRecurrence = new Recurrence({
        type: listReq.recurrence.type,
        period: listReq.recurrence.period,
        interval: listReq.recurrence.interval,
        startDate: listReq.recurrence.startDate,
        endDate: listReq.recurrence.endDate,
      });
      
      // Save the new Recurrence and get its ID
      const savedRecurrence = await newRecurrence.save();
      recurrenceId = savedRecurrence._id;
    }

    // Create the new List document
    const list = new List({
      name: listReq.name,
      budget: listReq.budgetLimit,
      categories: listReq.categories,
      recurrence: recurrenceId, // Use the recurrence ID, whether new or existing
      createdBy: userId,
    });

    // Save the List document to the database
    await list.save();

    // Send the created list as a response
    res.status(201).send(list);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'An error occurred while creating the list.' });
  }
});

router.get('/getlists/:userId', authMiddleware, async (req, res) => {
  const userId = req.user;
  const lists = await List.find({ $or: [{ createdBy: userId }, { sharedWith: userId }] })
    .populate('createdBy') // Populate the createdBy field with the User object
    .populate('sharedWith'); // Populate the sharedWith field with the User objects
  res.send(lists);
});

router.post('/lists/:listId/share', authMiddleware, async (req, res) => {
    const { listId } = req.params;
    const { userId } = req.body;
    const list = await List.findByIdAndUpdate(
      listId,
      { $addToSet: { sharedWith: userId } },
      { new: true }
    );
    res.send(list);
});


router.post('/expenses', authMiddleware, async (req, res) => {
    const { list, name, amount, categories, date, createdBy } = req.body;
    const userId = req.user;
    const listId = list._id; // Extract listId from the list object
    const listSearch = await List.findById(listId);
    if (!listSearch.categories.includes(categories)) {
        return res.status(400).send({ message: 'Invalid category' });
    }
    const expense = new Expense({ listId, name, amount, category: categories, date, createdBy: userId });
    await expense.save();
    listSearch.expenses.push(expense._id);
    await listSearch.save();
    res.status(201).send(expense);
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

module.exports = router;