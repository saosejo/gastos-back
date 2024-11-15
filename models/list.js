// models/User.js
const mongoose = require('mongoose');

const listSchema = new mongoose.Schema({
  name: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  categories: [String],
  expenses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }]
});

const List = mongoose.model('List', listSchema);
module.exports = List;