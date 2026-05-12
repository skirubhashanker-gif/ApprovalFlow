// models/Approval.js
const mongoose = require('mongoose');

const approvalItemSchema = new mongoose.Schema({
    unit: String,
    sapCode: String,
    description: String,
    taxCode: String,
    validityFrom: String,
    validityTo: String,
    quotedPrice: String,
    negotiatedPrice: String,
    uom: String,
    monthlyConsumption: String,
    procurementValue: String,
    existingVendor: String,
    existingPrice: String,
    remarks: String
});

const approvalSchema = new mongoose.Schema({
    approvalId: { type: String, unique: true, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'partially_approved'],
        default: 'pending'
    },
    formData: {
        approvalDate: Date,
        purchaseType: String,
        itemNature: String,
        itemCategory: String,
        supplierCode: String,
        supplierName: String,
        initiatingDept: String,
        cftRemarks: String,
        items: [approvalItemSchema],
        totalValue: String
    },
    approvals: {
        purchase: {
            approved: { type: Boolean, default: false },
            date: Date,
            comments: String,
            approvedBy: String
        },
        rd: {
            approved: { type: Boolean, default: false },
            date: Date,
            comments: String,
            approvedBy: String
        },
        vp: {
            approved: { type: Boolean, default: false },
            date: Date,
            comments: String,
            approvedBy: String
        },
        finance: {
            approved: { type: Boolean, default: false },
            date: Date,
            comments: String,
            approvedBy: String
        },
        ceo: {
            approved: { type: Boolean, default: false },
            date: Date,
            comments: String,
            approvedBy: String
        },
        director: {
            approved: { type: Boolean, default: false },
            date: Date,
            comments: String,
            approvedBy: String
        }
    },
    createdAt: { type: Date, default: Date.now },
    approvedAt: Date,
    pdfPath: String,
    pdfGeneratedAt: Date
});

module.exports = mongoose.model('Approval', approvalSchema);