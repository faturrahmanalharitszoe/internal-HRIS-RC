# Internal HRIS System (Resik Cemerlang)

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![MySQL](https://img.shields.io/badge/mysql-%2300f.svg?style=for-the-badge&logo=mysql&logoColor=white)

A comprehensive Internal Human Resource Information System (HRIS) built to streamline employee management, payroll, and leave monitoring. This application features a robust multi-tenant architecture supporting multiple regions and tenants.

## 🚀 Key Features

### 💰 Payroll Management (Slip Gaji)
- **Digital Payslips**: Generate and view monthly salary slips.
- **Secure Access**: Protected by a 6-digit PIN system using Bcrypt hashing.
- **Bulk Upload**: Admin capability to upload staff salary data via Excel (`.xlsx`).
- **Export to PDF**: Integrated PDF generation using `jspdf` and `pdf-lib`.

### 📅 Leave & Attendance Monitoring (Cuti)
- **History Tracking**: Comprehensive logs of employee leave and attendance history.
- **Quota Calculation**: Automated calculation of remaining leave based on employee anniversary dates and project-specific holidays.
- **Holiday Integration**: Automatically syncs with national holidays and mandatory leave (Cuti Bersama).

### 🔐 Security & Authentication
- **Multi-layer Hashing**: Passwords secured using a unique `SHA-256(MD5(password))` pattern.
- **Role-based Access Control**: Distinct interfaces for Admins, Staff, and General Employees.
- **PIN-based Verification**: Additional security layer for sensitive financial data.

### 🏢 Multi-tenant Support
- Designed to handle multiple **Regions** and **Tenants** within a single dashboard.
- Dynamic filtering based on tenant-specific data.

## 🛠️ Technical Stack

- **Frontend**: React 19, Tailwind CSS, Axios, Recharts (Data Visualization).
- **Backend**: Node.js, Express.js.
- **Database**: MySQL (using `mysql2/promise` for async/await).
- **Libraries**: SweetAlert2 (UI Alerts), FontAwesome (Icons), XLSX (Excel processing).

## 🏗️ Architecture

The project follows a decoupled architecture:
- **Frontend**: A modern SPA built with React and styled with Tailwind CSS for a premium, responsive look.
- **Backend**: A RESTful API built with Express handling business logic, authentication, and database transactions.

## 🚦 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MySQL Server

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/internal-hris.git
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   # Configure your .env file
   npm start
   ```

3. **Frontend Setup**
   ```bash
   cd frontend/internal-app
   npm install
   npm start
   ```

---

*This project was developed for internal use at Resik Cemerlang to optimize operational workflows.*
