require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Import the cors library
const mongoose = require('mongoose');

const app = express();
app.use(express.json());


app.use(cors({
  origin: 'http://localhost:3000', // Replace with your frontend's origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'] // Specify allowed headers
}));
// Connect to MongoDB (using cloud connection string)
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB Cloud'))
.catch((error) => console.error('MongoDB connection error:', error));

const userRoutes = require('./routes/userRoutes');
const listRoutes = require('./routes/listRoutes');
app.use('/api/users', userRoutes);
app.use('/api/list', listRoutes);


// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
