// models/Categories.js
const mongoose = require('mongoose');


const categorySchema = new mongoose.Schema({
  name: String,
  budget: Number
});

const Category = mongoose.model('Category', categorySchema);
module.exports = Category;