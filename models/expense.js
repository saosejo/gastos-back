// models/User.js
const mongoose = require('mongoose');


const expenseSchema = new mongoose.Schema({
  listId: { type: mongoose.Schema.Types.ObjectId, ref: 'List' },
  description: String,
  amount: Number,
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  date: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const Expense = mongoose.model('Expense', expenseSchema);
module.exports = Expense;