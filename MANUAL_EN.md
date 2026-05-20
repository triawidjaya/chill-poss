# CHILL POS APP - USER MANUAL (ENGLISH)

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Basic Operations](#basic-operations)
4. [Transaction Management](#transaction-management)
5. [Shift Management](#shift-management)
6. [User Management](#user-management)
7. [Settings & Customization](#settings)
8. [Reports & Export](#reports)
9. [Troubleshooting](#troubleshooting)
10. [FAQ](#faq)

---

## Introduction

Welcome to **CHILL POS App**, a modern and flexible Point of Sale (POS) system designed for small to medium-sized businesses. This comprehensive guide will help you master every feature.

### What is CHILL POS?

CHILL POS is a web-based cashier and transaction management system that allows you to:
- Record income and outgoing transactions
- Manage daily shifts and staff
- Track financial records across multiple devices
- Export data to Excel and CSV formats
- Manage user accounts with role-based permissions

### Two Operating Modes

**Local Mode:** Data stays only in your browser. No setup required, but data is only accessible on this device.

**Cloud Mode:** Data syncs across multiple devices in real-time. Requires a Supabase project setup for multi-device synchronization.

---

## Getting Started

### First Launch

When you first open CHILL POS, you will need to enter an access code and choose your operating mode.

#### Step 1: Access Code
1. Enter the access code (default: `smallbutspicy`)
2. This code restricts access to authorized users only

#### Step 2: Choose Operating Mode
1. **Local Mode:** Select if working on a single device
2. **Cloud Mode:** Select if you need to sync data across devices

#### Step 3: Initial Setup
1. Enter your business name (e.g., "Warung Pak Budi")
2. Add transaction categories (one per line)
3. Add staff names (one per line)
4. Select admin user and set a 4-6 digit PIN
5. Click "Finish Setup"

---

## Basic Operations

### Main Dashboard

The main screen displays:
- Current date and time
- Business name
- Dashboard summary
- Transaction table with all entries

### Header Controls

**Settings (Gear Icon)**
- Access business settings, manage categories and staff

**Shift History (Clock Icon)**
- View closed shifts and historical data

**Language Toggle (ID/EN)**
- Switch between Indonesian and English

**Theme Toggle (Moon Icon)**
- Switch between light and dark mode

**User Menu (User Icon)**
- View current user info and sign out

---

## Transaction Management

### Adding a New Transaction

1. Click the green "+ New Transaction" button
2. Select transaction type: "Income" or "Outgoing"
3. Choose a category
4. Select payment method (Cash, Card, Transfer, QRIS)
5. Enter description
6. Enter amount
7. Select staff member
8. Click "Save"

### Editing Transactions

Only admin users can edit transactions:
1. Click the edit (pencil) icon on a transaction
2. Modify the details
3. Click "Save"

### Deleting Transactions

Only admin users can delete transactions:
1. Click the delete (trash) icon
2. Confirm the deletion

### Filtering & Searching

Filter transactions by:
- Transaction type (Income/Outgoing)
- Category
- Search by description

### Sorting

Click on any column header to sort the table.

---

## Shift Management

### Starting a Shift

Before recording any transactions, you must start a shift:

1. Click "Start Shift"
2. Select the staff member on duty
3. Enter the initial cash balance
4. Enter your PIN
5. Click "Start Shift" to confirm

### Closing a Shift

At the end of your shift:

1. Click the red "Close Shift" button
2. Enter actual cash balance
3. Enter actual card/transfer/QRIS totals
4. Review the summary (expected vs. actual)
5. Click "Confirm Close Shift"

### Understanding Shift Summary

The shift summary shows:
- **Expected:** Calculated from transactions
- **Actual:** Physical count
- **Difference:** Actual minus Expected (helps identify discrepancies)

---

## User Management

### User Roles

| Role | Permissions | Notes |
|------|-------------|-------|
| Admin | All permissions, Settings, User management, Delete transactions | Full control |
| Cashier | Create transactions, Close shift, Export data | Limited to daily transactions |

### Adding a New User

1. Click "Settings" > "Manage Users"
2. Enter username
3. Select role (Admin or Cashier)
4. Set a PIN (optional)
5. Click "Add User"

### Managing Users

Admin users can:
- Set or reset user PINs
- Delete users
- Change user roles

### PIN Security

PINs are:
- 4-6 digits only
- Hashed with SHA-256 encryption
- Never stored in plain text

---

## Settings & Customization

### Accessing Settings

Click the "Settings" (gear) icon in the header.

### Business Settings

**Brand Name**
- Change your business name (appears in header)

**Business Logo**
- Upload a PNG image (auto-converted)

### Managing Categories

1. View existing categories
2. Click "Add Category" to add new ones
3. Delete categories by clicking the trash icon

### Admin Approval Categories

Certain categories can be marked to require admin approval. When a cashier records a transaction in these categories, they must enter an admin PIN.

### Reset to Defaults

Click "Reset Default" to revert all settings to default values.

---

## Reports & Export

### Exporting Transactions

1. Click "Export Excel" button
2. A .xlsx file will download with all current transactions

### Shift History

Access shift history from the header icon:
- View past 50 closed shifts
- Expand shift details
- Export individual shifts
- Delete old shifts (admin only)

### Backup Recommendations

**In Local Mode:**
- Export to Excel regularly
- Store backups securely

**In Cloud Mode:**
- Data is automatically backed up
- Still recommended to export periodically

---

## Troubleshooting

### Cloud Connection Error

**Issue:** Cannot connect to Supabase

**Solution:**
1. Check your internet connection
2. Verify Supabase URL and Key are correct
3. Try resetting and reconfiguring

### Forgotten PIN

**Issue:** Cannot log in due to forgotten PIN

**Solution:**
1. Click "Forgot PIN" on the login screen
2. Enter the access code
3. Set a new PIN

### Data Not Syncing Across Devices

**Issue:** Cloud mode is not syncing data

**Solution:**
1. Ensure both devices use the same Supabase URL and Key
2. Check internet connection on both devices
3. Refresh the page (may take a few seconds to sync)

### Cannot Delete Transaction

**Issue:** Delete button is disabled

**Solution:** Only admin users can delete transactions. Sign in as admin.

---

## FAQ

### Q: Can I use CHILL POS offline?

A: Yes, in Local Mode your data stays in the browser. In Cloud Mode with offline capability, transactions can be queued and synced later.

### Q: Is my data secure?

A: Yes. PINs are encrypted with SHA-256. In Cloud Mode, Supabase provides enterprise-grade security.

### Q: Can I upgrade from Local to Cloud later?

A: Yes. Use the "Upgrade to Cloud" option in Settings.

### Q: How long is shift history kept?

A: The last 50 shifts are retained automatically.

### Q: Can multiple staff work simultaneously?

A: Yes. Each transaction is attributed to the logged-in staff member. In Cloud Mode, multiple users can work across different devices in real-time.

### Q: What payment methods are supported?

A: Cash, Card, Bank Transfer, and QRIS.

---

**For more help, please contact support at triawidjaya@hotmail.com**

*CHILL POS APP v2.0 - Last updated 2026*
