// models/User.js
const mongoose = require('mongoose');


const expenseSchema = new mongoose.Schema({
  listId: { type: mongoose.Schema.Types.ObjectId, ref: 'List' },
  name: String,
  amount: Number,
  category: String,
  date: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const Expense = mongoose.model('Expense', expenseSchema);
module.exports = Expense;