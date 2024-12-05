// service/auth/authMiddleware.js
require('dotenv').config();
const jwt = require('jsonwebtoken');


// Middleware to verify token
const authMiddleware = (req, res, next) => {
  console.log(req.headers);
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.userId;  // Attach user info to the request
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Function to sign a token
const signToken = (user) => {
  return jwt.sign(
    { userId: user._id }, 
    process.env.JWT_SECRET, 
    { expiresIn: '10h' }
  );
};

// Export both functions using named exports
module.exports = {
  authMiddleware,
  signToken
};
