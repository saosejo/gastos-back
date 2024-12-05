// models/User.js
const mongoose = require('mongoose');


const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  sharedLists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'List' }]
});

const User = mongoose.model('User', userSchema);
module.exports = User;
