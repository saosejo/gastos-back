// models/User.js
const mongoose = require('mongoose');
const Category = require('./category');


const listSchema = new mongoose.Schema({
  name: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  budget: Number,
  categories: [String],
  expenses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
  recurrence: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurrence' },
});

const List = mongoose.model('List', listSchema);
module.exports = List;