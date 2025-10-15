

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
// const port = process.env.PORT || 3000;


// মিডলওয়্যার
app.use(express.json()); // To parse incoming JSON data from request body

// CORS কনফিগারেশন
app.use(cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));





// 3. MongoDB সংযোগ স্থাপন (Vercel/Serverless ফ্রেন্ডলি)
const uri = process.env.MONGO_URI;
// ... (অন্যান্য কোড)

if (mongoose.connection.readyState === 0) {
    mongoose.connect(uri, {
        // Vercel ফাংশনগুলি দ্রুত চালু এবং বন্ধ হয়, তাই দ্রুত সংযোগ চাই
        serverSelectionTimeoutMS: 5000, // 10000ms থেকে 5000ms এ নামানো হলো
        socketTimeoutMS: 45000,      // সকেটের সময় বাড়ানো হলো
        // (যদি Mongoose v6 এর নিচে ব্যবহার করেন তবে নিচের দুটি লাইন প্রয়োজন)
        // useNewUrlParser: true, 
        // useUnifiedTopology: true 
    })
        .then(() => console.log('MongoDB successfully connected'))
        .catch(err => console.error('MongoDB connection error:', err.message));
} else {
    console.log('MongoDB is already connected.');
}







// 4. Define the Schema (Order Model)
// এখানে Order Model-টি সংজ্ঞায়িত করা হয়েছে, তাই আর require('../models/Order') দরকার নেই
const orderSchema = new mongoose.Schema({
    // 1. বিলিং তথ্য
    billingDetails: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true }
    },

    // 2. অর্ডার করা পণ্যের তালিকা
    orderedProducts: [{
        category: { type: String, required: true }, // ✅ নতুন: ক্যাটাগরি (যেমন: Panjabi)
        image: String,
        name: { type: String, required: true },
        price: { type: Number, required: true },
        size: { type: String, required: true },
        color: { type: String, required: true },
        quantity: { type: Number, default: 1 }
    }],

    // 3. শিপিং তথ্য
    shippingInfo: {
        type: {
            type: String,
            enum: ['Inside Dhaka', 'Outside Dhaka'],
            required: true
        },
        cost: { type: Number, required: true }
    },

    // 4. মূল্যের সারাংশ (Summary)
    summary: {
        subtotal: { type: Number, required: true },
        total: { type: Number, required: true },
        paymentMethod: { type: String, default: 'Cash On Delivery' }
    },

    // 5. অর্ডারের অবস্থা
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending'
    },

    // 6. অর্ডারের তারিখ
    orderDate: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true }); // ✅ নতুন: কখন তৈরি হলো/আপডেট হলো, তা স্বয়ংক্রিয়ভাবে ট্র্যাক করবে






module.exports = mongoose.model('Order', orderSchema);

const Order = mongoose.model('Order', orderSchema);


// ===============================================
// 5. API রুট তৈরি করা
// ===============================================/

// ✅ রুট পাথ (`/`) হ্যান্ডেল করার জন্য একটি রুট যুক্ত করুন (Vercel Test করার জন্য)
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Kashmeeri API is running successfully!',
        version: '1.0',
        availableRoutes: ['/api/orders', '/api/auth/login']
    });
});




// POST Route: নতুন অর্ডার তৈরি 
app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;

        // প্রাথমিক ডেটা চেক (যথেষ্ট নয়, তবে দ্রুত ব্যর্থতার জন্য ভালো)
        if (!orderData.billingDetails || !orderData.orderedProducts || orderData.orderedProducts.length === 0) {
            return res.status(400).json({
                message: 'Invalid order data: Missing billing details or products list.'
            });
        }

        // Mongoose Schema অনুযায়ী নতুন অর্ডার ইনস্ট্যান্স তৈরি
        // এটিই Mongoose-এর সমস্ত ভ্যালিডেশন (required, enum, Number type) চেক করবে।
        const newOrder = new Order(orderData);

        // ভ্যালিডেশন সফল হলে ডেটাবেসে সেভ করা হবে
        await newOrder.save();

        console.log('Order successfully saved to DB. ID:', newOrder._id);
        res.status(201).json({
            message: 'Order placed successfully!',
            orderId: newOrder._id,
            status: newOrder.status // নিশ্চিত করার জন্য স্ট্যাটাস ফেরত দেওয়া হলো
        });

    } catch (error) {
        console.error('Error saving order:', error);

        // Mongoose Validation Error হ্যান্ডেল করা
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                message: 'Validation failed in order data.',
                errors: messages
            });
        }

        // অন্য কোনো সার্ভার এরর হ্যান্ডেল করা
        res.status(500).json({
            message: 'Failed to place order due to a server error.',
            error: error.message
        });
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






// Vercel-এর জন্য অ্যাপ অবজেক্ট এক্সপোর্ট করুন
module.exports = app;


// 6. সার্ভার স্টার্ট করা
// app.listen(port, () => {
//     console.log(`Server is running at http://localhost:${port}`);
// });