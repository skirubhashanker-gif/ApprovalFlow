// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Schema for approval records
const approvalSchema = new mongoose.Schema({
    approvalId: { type: String, unique: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    formData: Object,
    approvals: {
        purchase: { approved: Boolean, date: Date, comments: String },
        rd: { approved: Boolean, date: Date, comments: String },
        vp: { approved: Boolean, date: Date, comments: String },
        finance: { approved: Boolean, date: Date, comments: String },
        ceo: { approved: Boolean, date: Date, comments: String },
        director: { approved: Boolean, date: Date, comments: String }
    },
    createdAt: { type: Date, default: Date.now },
    approvedAt: Date,
    pdfPath: String
});

const Approval = mongoose.model('Approval', approvalSchema);

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/purchase_approval', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Generate unique approval ID
function generateApprovalId() {
    return 'APPR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Submit approval request
app.post('/api/submit-approval', async (req, res) => {
    try {
        const formData = req.body;
        const approvalId = generateApprovalId();
        
        const approval = new Approval({
            approvalId: approvalId,
            formData: formData,
            status: 'pending'
        });
        
        await approval.save();
        
        // Send email notifications to approvers (implement based on your email system)
        await sendApprovalNotifications(approvalId, formData);
        
        res.json({
            success: true,
            approvalId: approvalId,
            message: 'Approval request submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting approval:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting approval request'
        });
    }
});

// Get approval status
app.get('/api/approval-status/:id', async (req, res) => {
    try {
        const approval = await Approval.findOne({ approvalId: req.params.id });
        if (!approval) {
            return res.status(404).json({ success: false, message: 'Approval not found' });
        }
        res.json({ success: true, status: approval.status, data: approval });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching status' });
    }
});

// Update approval (for approvers)
app.post('/api/update-approval/:id', async (req, res) => {
    try {
        const { role, approved, comments } = req.body;
        const approval = await Approval.findOne({ approvalId: req.params.id });
        
        if (!approval) {
            return res.status(404).json({ success: false, message: 'Approval not found' });
        }
        
        // Update specific approver
        if (approval.approvals[role]) {
            approval.approvals[role] = {
                approved: approved,
                date: new Date(),
                comments: comments
            };
        }
        
        // Check if all approvals are done
        const allApproved = Object.values(approval.approvals).every(a => a && a.approved === true);
        
        if (allApproved) {
            approval.status = 'approved';
            approval.approvedAt = new Date();
            
            // Generate PDF after full approval
            const pdfPath = await generatePDF(approval);
            approval.pdfPath = pdfPath;
        }
        
        await approval.save();
        
        // If approved, send PDF via email
        if (allApproved) {
            await sendApprovedPDF(approval);
        }
        
        res.json({
            success: true,
            status: approval.status,
            message: allApproved ? 'Fully approved! PDF generated.' : 'Approval updated'
        });
    } catch (error) {
        console.error('Error updating approval:', error);
        res.status(500).json({ success: false, message: 'Error updating approval' });
    }
});

// Generate PDF function
async function generatePDF(approval) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
        const filename = `approval_${approval.approvalId}_${Date.now()}.pdf`;
        const filepath = path.join(__dirname, 'pdfs', filename);
        
        // Ensure pdfs directory exists
        if (!fs.existsSync(path.join(__dirname, 'pdfs'))) {
            fs.mkdirSync(path.join(__dirname, 'pdfs'));
        }
        
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);
        
        // Header
        doc.fontSize(18).font('Helvetica-Bold').text('PURCHASE COMMITTEE APPROVAL FORM', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).font('Helvetica').text(`Approval ID: ${approval.approvalId}`, { align: 'right' });
        doc.text(`Date: ${new Date(approval.createdAt).toLocaleDateString()}`, { align: 'right' });
        doc.text(`Status: ${approval.status.toUpperCase()}`, { align: 'right' });
        doc.moveDown();
        
        // Approval Details
        doc.fontSize(12).font('Helvetica-Bold').text('APPROVAL DETAILS');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        const formData = approval.formData;
        doc.text(`Purchase Type: ${formData.purchaseType || 'N/A'}`);
        doc.text(`Item Nature: ${formData.itemNature || 'N/A'}`);
        doc.text(`Item Category: ${formData.itemCategory || 'N/A'}`);
        doc.text(`Supplier Code: ${formData.supplierCode || 'N/A'}`);
        doc.text(`Supplier Name: ${formData.supplierName || 'N/A'}`);
        doc.moveDown();
        
        // Items Table
        doc.fontSize(12).font('Helvetica-Bold').text('ITEMS DETAILS');
        doc.moveDown(0.5);
        
        const tableTop = doc.y;
        const headers = ['Unit', 'SAP Code', 'Description', 'Tax', 'Quoted', 'Negotiated', 'Qty', 'Value'];
        const columnWidths = [40, 60, 80, 40, 50, 50, 50, 60];
        let currentY = tableTop;
        
        // Draw headers
        doc.fontSize(8).font('Helvetica-Bold');
        let currentX = doc.x;
        headers.forEach((header, i) => {
            doc.text(header, currentX, currentY, { width: columnWidths[i], align: 'center' });
            currentX += columnWidths[i];
        });
        
        currentY += 15;
        doc.fontSize(8).font('Helvetica');
        
        // Draw rows
        formData.items.forEach(item => {
            currentX = doc.x;
            const rowData = [
                item.unit || '',
                item.sapCode || '',
                (item.description || '').substring(0, 20),
                item.taxCode || '',
                item.quotedPrice || '0',
                item.negotiatedPrice || '0',
                item.monthlyConsumption || '0',
                item.procurementValue || '0'
            ];
            
            rowData.forEach((data, i) => {
                doc.text(data.toString(), currentX, currentY, { width: columnWidths[i], align: 'center' });
                currentX += columnWidths[i];
            });
            currentY += 15;
            
            if (currentY > 500) {
                doc.addPage();
                currentY = 50;
            }
        });
        
        doc.moveDown();
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(`Total Procurement Value: Rs. ${formData.totalValue || '0'}`, { align: 'right' });
        doc.moveDown();
        
        // Department Info
        doc.fontSize(12).font('Helvetica-Bold').text('DEPARTMENT INFORMATION');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Initiating Department: ${formData.initiatingDept || 'N/A'}`);
        doc.text(`CFT Remarks: ${formData.cftRemarks || 'N/A'}`);
        doc.moveDown();
        
        // Approvals
        doc.fontSize(12).font('Helvetica-Bold').text('APPROVALS');
        doc.moveDown(0.5);
        doc.fontSize(9).font('Helvetica');
        
        const approvals = [
            { label: 'Purchase', data: approval.approvals.purchase },
            { label: 'R&D', data: approval.approvals.rd },
            { label: 'VP - Operations', data: approval.approvals.vp },
            { label: 'Finance & Accounts', data: approval.approvals.finance },
            { label: 'CEO', data: approval.approvals.ceo },
            { label: 'Director', data: approval.approvals.director }
        ];
        
        approvals.forEach(approver => {
            if (approver.data) {
                doc.text(`${approver.label}: ${approver.data.approved ? 'APPROVED' : 'PENDING'} - ${approver.data.comments || ''} (${new Date(approver.data.date).toLocaleDateString()})`);
            } else {
                doc.text(`${approver.label}: PENDING`);
            }
        });
        
        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).font('Helvetica');
            doc.text(`Generated on ${new Date().toLocaleString()}`, 50, doc.page.height - 50, { align: 'center' });
        }
        
        doc.end();
        
        stream.on('finish', () => resolve(filepath));
        stream.on('error', reject);
    });
}

// Email notification functions (implement with your email service)
async function sendApprovalNotifications(approvalId, formData) {
    // Integrate with your email service (nodemailer, SendGrid, etc.)
    console.log(`Sending approval notifications for ${approvalId}`);
    // Implementation depends on your email system
}

async function sendApprovedPDF(approval) {
    console.log(`Sending approved PDF for ${approval.approvalId}`);
    // Implementation depends on your email system
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the form at http://localhost:${PORT}`);
});