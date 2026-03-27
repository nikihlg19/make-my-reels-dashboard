import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { Project, Client } from '../../types';

export const generateInvoice = (project: Project, client?: Client) => {
  const doc = new jsPDF();
  
  // Custom styling variables
  const primaryColor: [number, number, number] = [79, 70, 229]; // Indigo 600
  const secondaryColor: [number, number, number] = [100, 116, 139]; // Slate 500
  
  // Header Logo / Company Name
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(import.meta.env.VITE_COMPANY_NAME || 'MAKE MY REELS', 14, 25);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...secondaryColor);
  doc.text(import.meta.env.VITE_COMPANY_LOCATION || 'Mumbai, Maharashtra, India', 14, 32);
  doc.text(import.meta.env.VITE_COMPANY_EMAIL || 'contact@makemyreels.com', 14, 37);

  // Invoice Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.text('INVOICE', 130, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...secondaryColor);
  const invoiceNum = `INV-${project.id.slice(0, 6).toUpperCase()}`;
  doc.text(`Invoice Number: ${invoiceNum}`, 130, 32);
  doc.text(`Date: ${format(new Date(), 'dd MMM yyyy')}`, 130, 37);
  doc.text(`Due Date: ${format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'dd MMM yyyy')}`, 130, 42); // +7 days

  // Divider Line
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.5);
  doc.line(14, 50, 196, 50);

  // Bill To Section
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Bill To:', 14, 60);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...secondaryColor);
  if (client) {
    doc.setFont('helvetica', 'bold');
    doc.text(client.company || client.name, 14, 67);
    doc.setFont('helvetica', 'normal');
    doc.text(client.name, 14, 72);
    if (client.email) doc.text(client.email, 14, 77);
    doc.text(client.phone, 14, 82);
  } else {
    doc.text('Client details not provided', 14, 67);
  }

  // Project Details
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Project Details:', 130, 60);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...secondaryColor);
  doc.text(`Title: ${project.title}`, 130, 67);
  const eventDateParsed = new Date(project.eventDate);
  doc.text(`Shoot Date: ${isNaN(eventDateParsed.getTime()) ? 'TBD' : format(eventDateParsed, 'dd MMM yyyy')}`, 130, 72);
  doc.text(`Location: ${project.location}`, 130, 77);

  // Table
  const tableData = [
    [
      'Video Production Services',
      project.description || 'Standard Production Package',
      '1',
      `Rs. ${(project.invoice_amount || 0).toLocaleString()}`
    ]
  ];

  // @ts-ignore
  doc.autoTable({
    startY: 95,
    head: [['Item', 'Description', 'Qty', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: 255,
      fontStyle: 'bold',
    },
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 6,
      textColor: [50, 50, 50],
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 80 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 32, halign: 'right' },
    },
  });

  // @ts-ignore
  const finalY = doc.lastAutoTable.finalY || 150;

  // Total Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Subtotal:', 140, finalY + 15);
  doc.text(`Rs. ${(project.invoice_amount || 0).toLocaleString()}`, 196, finalY + 15, { align: 'right' });
  
  doc.setFontSize(12);
  doc.text('Total Due:', 140, finalY + 25);
  doc.setTextColor(...primaryColor);
  doc.text(`Rs. ${(project.invoice_amount || 0).toLocaleString()}`, 196, finalY + 25, { align: 'right' });

  // Footer / Payment Terms
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Payment Terms:', 14, finalY + 45);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...secondaryColor);
  doc.text('Please pay within 7 days of receiving this invoice.', 14, finalY + 52);
  
  if (project.razorpay_link_url) {
    doc.setTextColor(...primaryColor);
    doc.textWithLink('Click here to pay online safely via Razorpay', 14, finalY + 59, { url: project.razorpay_link_url });
  }

  // Save the PDF
  const safeName = (client?.company || 'Client').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'Client';
  doc.save(`${invoiceNum}_${safeName}.pdf`);
};
