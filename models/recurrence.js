// models/Recurrence.js
const mongoose = require('mongoose');


const listSchema = new mongoose.Schema({
  type: String,
  period: String,
  interval: Number,
  startDate: Date,
  endDate: Date,
});

const Recurrence = mongoose.model('Recurrence', listSchema);
module.exports = Recurrence;