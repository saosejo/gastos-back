// models/Recurrence.js
const mongoose = require('mongoose');


const recurrenceSchema = new mongoose.Schema({
  type: String,
  period: String,
  interval: Number,
  startDate: Date,
  endDate: Date,
});

const Recurrence = mongoose.model('Recurrence', recurrenceSchema);
module.exports = Recurrence;