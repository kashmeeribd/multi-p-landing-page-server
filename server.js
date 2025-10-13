

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

const User = require('./models/user'); // User মডেল ইমপোর্ট করা

// Access PORT from .env file (defaults to 3000 if not set)
const port = process.env.PORT || 3000;


// মিডলওয়্যার
app.use(express.json()); // To parse incoming JSON data from request body

// CORS কনফিগারেশন
app.use(cors({
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));


// 3. MongoDB সংযোগ স্থাপন
const uri = process.env.MONGO_URI;

if (!uri) {
    console.error('FATAL ERROR: MONGO_URI is not defined in .env file.');
    // process.exit(1);
}

mongoose.connect(uri)
    .then(() => console.log('MongoDB successfully connected'))
    .catch(err => console.error('MongoDB connection error:', err.message));


// 4. Define the Schema (Order Model)
// এখানে Order Model-টি সংজ্ঞায়িত করা হয়েছে, তাই আর require('../models/Order') দরকার নেই
const orderSchema = new mongoose.Schema({
    billingDetails: {
        name: String,
        phone: String,
        address: String
    },
    orderedProducts: [{
        image: String,
        name: String,
        price: String,
        size: String,
        color: String,
        quantity: Number
    }],
    shippingInfo: { 
        type: { type: String }, 
        cost: String
    },
    summary: {
        subtotal: String,
        total: String,
        paymentMethod: String
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending'
    },
    orderDate: {
        type: Date,
        default: Date.now
    }
});

const Order = mongoose.model('Order', orderSchema);


// ===============================================
// 5. API রুট তৈরি করা
// ===============================================/

// POST Route: নতুন অর্ডার তৈরি
app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        
        if (!orderData.billingDetails || orderData.orderedProducts.length === 0) {
            return res.status(400).json({ message: 'Invalid order data: Missing billing details or products.' });
        }

        const newOrder = new Order(orderData);
        await newOrder.save();
        
        console.log('Order successfully saved to DB:', newOrder._id);
        res.status(201).json({ message: 'Order placed successfully!', orderId: newOrder._id });
    } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).json({ message: 'Failed to place order', error: error.message });
    }
});


// GET Route: সমস্ত অর্ডার আনা (ডেট ফিল্টার সহ)
app.get('/api/orders/all', async (req, res) => {
    try {
        const { startDate, endDate } = req.query; 
        let filter = {};

        if (startDate || endDate) {
            filter.orderDate = {};
            
            if (startDate) {
                filter.orderDate.$gte = new Date(startDate); 
            }
            if (endDate) {
                const endOfDay = new Date(endDate);
                endOfDay.setDate(endOfDay.getDate() + 1); // পরের দিনের শুরুতে যেতে
                filter.orderDate.$lt = endOfDay; 
            }
        }
        
        const orders = await Order.find(filter).sort({ orderDate: -1 });
        
        res.status(200).json(orders); 
        
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Failed to retrieve orders', error: error.message });
    }
});


// 🚨 PUT Route: সম্পূর্ণ অর্ডার এডিট ও আপডেটের জন্য 🚨
// এই রুটটি 404 এরর ঠিক করবে।
app.put('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id; 
        const updatedData = req.body;   

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { $set: updatedData }, // ফ্রন্টএন্ড থেকে আসা সমস্ত ডেটা দিয়ে আপডেট করা
            { 
                new: true, 
                runValidators: true
            }
        );

        if (!updatedOrder) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.status(200).json({ 
            message: 'Order updated successfully', 
            order: updatedOrder 
        });

    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ message: 'Internal server error during update', error: error.message });
    }
});


// PATCH Route: 
app.patch('/api/orders/:orderId/status', async (req, res) => {
    try {
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

        res.status(200).json({ 
            message: 'Order status updated successfully!', 
            order: updatedOrder 
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ message: 'Failed to update order status', error: error.message });
    }
});


// DELETE Route: অর্ডার ডিলিট
app.delete('/api/orders/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        const deletedOrder = await Order.findByIdAndDelete(orderId);

        if (!deletedOrder) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        res.status(200).json({ message: 'Order deleted successfully!', orderId });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ message: 'Failed to delete order', error: error.message });
    }
});




//  (লগইন রুট)

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        // ... validation checks ...

        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // 🚨 টোকেনে 'role' ডেটা যুক্ত করা 🚨
        const token = jwt.sign(
            { id: user._id, role: user.role }, // <-- role এখানে যুক্ত করা হলো
            process.env.JWT_SECRET || 'YOUR_SECRET_KEY', 
            { expiresIn: '1d' }
        );

        // 4. টোকেন সহ রেসপন্স পাঠানো
        res.status(200).json({ 
            status: 'success', 
            token, 
            user: { id: user._id, email: user.email, name: user.name, role: user.role } // রোলটি সরাসরিও পাঠানো যেতে পারে
        });

    } catch (error) {
        // ... error handling
    }
});


// (রেজিস্ট্রেশন রুট)

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body; 
        
        if (!name || !email || !password) {
             return res.status(400).json({ message: 'Name, Email, and password are required.' });
        }
        
        // 🚨 ইউজার তৈরি করার সময় 'role' ফিল্ডটি omit করা হয়েছে, যাতে এটি ডিফল্ট 'user' হয়। 🚨
        const newUser = await User.create({ name, email, password }); 
        
        // Response এ Role দেখানো
        res.status(201).json({ 
            message: 'User registered successfully! Now you can login.', 
            user: newUser.email, 
            name: newUser.name,
            role: newUser.role // 'user' রোলটি পাঠানো হবে
        });
    } catch (error) {
        // ... error handling
    }
});









// 6. সার্ভার স্টার্ট করা
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});