const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // পাসওয়ার্ড এনক্রিপশন

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6,
        select: false 
    },
    role: {
        type: String,
        enum: ['admin', 'user'], // শুধুমাত্র 'admin' বা 'user' এই দুইটা রোলই থাকবে
        default: 'user' // ডিফল্টভাবে নতুন ইউজাররা সবাই 'user' হবে
    },
});

// প্রি-সেভ হুক: পাসওয়ার্ড সেভ করার আগে এনক্রিপ্ট করা
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    // পাসওয়ার্ড হ্যাশ করা
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// পাসওয়ার্ড তুলনা করার জন্য ইনস্ট্যান্স মেথড
UserSchema.methods.comparePassword = async function (candidatePassword) {
    // এখানে this.password সেলেক্ট ফলস হওয়া সত্ত্বেও পাওয়া যায় কারণ এটি একটি ইনস্ট্যান্স মেথড
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);