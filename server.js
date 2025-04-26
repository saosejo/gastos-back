require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Import the cors library
const mongoose = require('mongoose');
let isConnected = false;
const app = express();
app.use(express.json());


app.use(cors({
  origin: 'http://localhost:5173', // Replace with your frontend's origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'] // Specify allowed headers
}));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  //await mongoose.connection.db.admin().ping();
  isConnected = true;
  console.log('✅ Successfully connected and pinged MongoDB');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
});

const userRoutes = require('./routes/userRoutes');
const listRoutes = require('./routes/listRoutes');
app.use('/api/users', userRoutes);
app.use('/api/list', listRoutes);





// Health check endpoint
app.get('/status', (req, res) => {
  res.json({
    status: isConnected ? 'ok' : 'error',
    mongoConnected: isConnected,
    message: isConnected ? 'MongoDB connection successful' : 'MongoDB not connected',
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
