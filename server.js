// 1. মডিউল এবং কনফিগারেশন লোড করা
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Load environment variables from .env file
dotenv.config();

// 2. অ্যাপ তৈরি এবং গ্লোবাল মিডলওয়্যার ব্যবহার করা
const app = express();

// User মডেল ইমপোর্ট করা (ধরে নিলাম এটি ./models/user.js ফাইলে আছে)
const User = require('./models/user');

// মিডলওয়্যার
app.use(express.json());

// CORS কনফিগারেশন
app.use(cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));

// ===============================================
// 3. MongoDB সংযোগ স্থাপন এবং ক্লায়েন্ট ক্যাশিং
// ===============================================

// Vercel-এর জন্য সংযোগ স্ট্রিং
const MONGODB_URI = process.env.MONGODB_URI;

// গ্লোবাল ভেরিয়েবল যা সংযোগ ক্লায়েন্টকে ধরে রাখবে
let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

// Vercel-এর জন্য কানেকশন ফাংশন
async function connectToDatabase() {
    if (cached.conn) {
        console.log('Using cached MongoDB connection.');
        return cached.conn;
    }

    if (!cached.promise) {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not set.');
        }

        const opts = {
            bufferCommands: false, // Vercel-এর জন্য দ্রুত সংযোগ
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            // useNewUrlParser: true, // Mongoose v6+ এ আর প্রয়োজন নেই
            // useUnifiedTopology: true 
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then(mongoose => {
            console.log('New MongoDB connection established.');
            return mongoose;
        }).catch(err => {
            console.error('MongoDB connection error:', err.message);
            throw err;
        });
    }

    cached.conn = await cached.promise;
    return cached.conn;
}

// ⚠️ সকল রুটের আগে এই ফাংশনটি কল করতে হবে (পরবর্তীতে রুটে যুক্ত করা হয়েছে)

// ===============================================
// 4. Schema এবং Model সংজ্ঞায়িত করা
// ===============================================

// অর্ডার স্কিমা (আগের কোড থেকে নেওয়া, ঠিক আছে)
const orderSchema = new mongoose.Schema({
    // ... (আপনার দেওয়া অর্ডার স্কিমার সম্পূর্ণ কোড) ...
    billingDetails: { name: { type: String, required: true }, phone: { type: String, required: true }, address: { type: String, required: true } },
    orderedProducts: [{
        category: { type: String, required: true },
        image: String,
        name: { type: String, required: true },
        price: { type: Number, required: true },
        size: { type: String, required: true },
        color: { type: String, required: true },
        quantity: { type: Number, default: 1 }
    }],
    shippingInfo: {
        type: { type: String, enum: ['Inside Dhaka', 'Outside Dhaka'], required: true },
        cost: { type: Number, required: true }
    },
    summary: {
        subtotal: { type: Number, required: true },
        total: { type: Number, required: true },
        paymentMethod: { type: String, default: 'Cash On Delivery' }
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending'
    },
    orderDate: { type: Date, default: Date.now }
}, { timestamps: true });

// Order Model একবার সংজ্ঞায়িত করা
// .models.Order থাকলে তা ব্যবহার করবে, না থাকলে নতুন করে তৈরি করবে
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ===============================================
// 5. API রুট তৈরি করা
// ===============================================

// ✅ রুট হ্যান্ডলিং মিডলওয়্যার যুক্ত করা
const apiHandler = (handler) => async (req, res) => {
    try {
        await connectToDatabase(); // প্রতিটি রিকোয়েস্টের জন্য সংযোগ নিশ্চিত করা
        await handler(req, res);
    } catch (error) {
        // Vercel-এ এরর হ্যান্ডেলিং এর জন্য
        console.error('API Handler Error:', error);
        res.status(500).json({
            message: 'Server connection or internal error.',
            error: error.message
        });
    }
};


// ✅ রুট পাথ (/) হ্যান্ডেল করার জন্য একটি রুট যুক্ত করুন (Vercel Test করার জন্য)
app.get('/', apiHandler(async (req, res) => {
    res.status(200).json({
        message: 'Kashmeeri API is running successfully!',
        version: '1.0',
        availableRoutes: ['/api/orders', '/api/orders/all', '/api/auth/login']
    });
}));


// POST Route: নতুন অর্ডার তৈরি 
app.post('/api/orders', apiHandler(async (req, res) => {
    const orderData = req.body;

    if (!orderData.billingDetails || !orderData.orderedProducts || orderData.orderedProducts.length === 0) {
        return res.status(400).json({ message: 'Invalid order data: Missing billing details or products list.' });
    }

    try {
        const newOrder = new Order(orderData);
        await newOrder.save();

        console.log('Order successfully saved to DB. ID:', newOrder._id);
        res.status(201).json({
            message: "Order placed successfully!",
            orderId: newOrder._id,
            status: newOrder.status,
            // এটি যোগ করুন:
            summary: newOrder.summary
        });
    } catch (error) {
        console.error('Error saving order:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: 'Validation failed in order data.', errors: messages });
        }
        res.status(500).json({ message: 'Failed to place order due to an internal error.', error: error.message });
    }
}));


// GET Route: সমস্ত অর্ডার আনা 
app.get('/api/orders/all', apiHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    let filter = {};

    if (startDate || endDate) {
        filter.orderDate = {};
        if (startDate) { filter.orderDate.$gte = new Date(startDate); }
        if (endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setDate(endOfDay.getDate() + 1);
            filter.orderDate.$lt = endOfDay;
        }
    }

    const orders = await Order.find(filter).sort({ orderDate: -1 });
    res.status(200).json(orders);
}));


// PUT Route: সম্পূর্ণ অর্ডার এডিট ও আপডেটের জন্য 
app.put('/api/orders/:id', apiHandler(async (req, res) => {
    const orderId = req.params.id;
    const updatedData = req.body;

    const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { $set: updatedData },
        { new: true, runValidators: true }
    );

    if (!updatedOrder) {
        return res.status(404).json({ message: 'Order not found' });
    }
    res.status(200).json({ message: 'Order updated successfully', order: updatedOrder });
}));


// PATCH Route: স্ট্যাটাস আপডেট
app.patch('/api/orders/:orderId/status', apiHandler(async (req, res) => {
    const orderId = req.params.orderId;
    const { newStatus } = req.body;

    if (!newStatus) {
        return res.status(400).json({ message: 'New status is required.' });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: newStatus },
        { new: true, runValidators: true }
    );

    if (!updatedOrder) {
        return res.status(404).json({ message: 'Order not found.' });
    }
    res.status(200).json({ message: 'Order status updated successfully!', order: updatedOrder });
}));


// DELETE Route: অর্ডার ডিলিট
app.delete('/api/orders/:orderId', apiHandler(async (req, res) => {
    const orderId = req.params.orderId;
    const deletedOrder = await Order.findByIdAndDelete(orderId);

    if (!deletedOrder) {
        return res.status(404).json({ message: 'Order not found.' });
    }
    res.status(200).json({ message: 'Order deleted successfully!', orderId });
}));


// (লগইন এবং রেজিস্ট্রেশন রুট - এখানে কোন পরিবর্তন করা হয়নি, যেহেতু User মডেল দেওয়া হয়নি)
app.post('/api/auth/login', async (req, res) => { /* ... */ });
app.post('/api/auth/register', async (req, res) => { /* ... */ });


// Vercel-এর জন্য অ্যাপ অবজেক্ট এক্সপোর্ট করুন
module.exports = app;