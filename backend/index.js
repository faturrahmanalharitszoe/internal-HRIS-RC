const express = require('express');
const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Import bcryptjs for cms_users
const app = express();
const port = 3003;

// Add CORS middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3000/internal-app', 'https://resikcemerlang.com'],
  methods: ['GET', 'POST'],
  credentials: true
}));

// Debug middleware for /login endpoint
app.use((req, res, next) => {
  if (req.method === 'POST' && req.url === '/internal-app/login') {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      // console.log('--- Login Endpoint Debug ---');
      // console.log('Raw request body:', data);
      // console.log('Headers:', req.headers);
      // console.log('Query params:', req.query);
      // console.log('-------------------------');
    });
  }
  next();
});

// Handle JSON parsing errors
app.use((req, res, next) => {
  express.json()(req, res, err => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      console.error('JSON parsing error:', err.message);
      return res.status(400).send('Invalid JSON format');
    }
    next(err);
  });
});

// Validate Content-Type
app.use((req, res, next) => {
  if (req.method === 'POST' && req.headers['content-type'] !== 'application/json') {
    console.log('Invalid Content-Type:', req.headers['content-type']);
    return res.status(400).send('Invalid Content-Type. Expected application/json');
  }
  next();
});

// Create a connection pool for MySQL
const pool = mysql.createPool({
  host: 'resikapps.online',
  user: 'root',
  password: 'kosong',
  database: 'resik_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Create a connection pool for PostgreSQL
const pool2 = new Pool({
  host: '34.126.104.76',
  user: 'envisionsapp',
  password: 'P@hlawanIII',
  database: 'attendance',
  port: 5433,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Base path for all routes
const basePath = '/internal-app';

// Route sederhana
app.get(basePath + '/', (req, res) => {
  res.send('Hello World!');
});

// Login endpoint
app.post(basePath + '/login', async (req, res) => {
  const { email, password } = req.body;

  // Validate required fields
  if (!email || !password) {
    console.log('Missing email or password in request body:', req.body);
    return res.status(400).send('Email and password are required');
  }

  try {
    const connection = await pool.getConnection();
    const connection2 = await pool2.connect();

    try {
      // Check admin table (user table) first - unchanged (no bcrypt)
      const [adminResults] = await connection.query(
        'SELECT * FROM user WHERE email = ? AND password = ? AND aktif = 1',
        [email, password]
      );

      if (adminResults.length > 0) {
        const adminData = { ...adminResults[0] };
        delete adminData.password;
        adminData.loginFrom = 'admin';
        connection.release();
        connection2.release();
        return res.json(adminData);
      }

      // Check cms_users with bcrypt
      const results = await connection2.query(
        'SELECT c.*, pi.nik FROM cms_users c JOIN personal_info pi ON c.id_personal_info = pi.id WHERE c.email = $1',
        [email]
      );

      if (results.rows.length === 0) {
        connection.release();
        connection2.release();
        return res.status(401).send('Email or password incorrect');
      }

      const user = results.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        connection.release();
        connection2.release();
        return res.status(401).send('Email or password incorrect');
      }

      const nik = user.nik;

      // Check gaji table (employee)
      const [gajiResults] = await connection.query(
        'SELECT * FROM gaji WHERE nik = ? LIMIT 1',
        [nik]
      );

      if (gajiResults.length > 0) {
        const [employeeResults] = await connection.query(
          'SELECT * FROM employee WHERE nik = ?',
          [nik]
        );

        if (employeeResults.length === 0) {
          const userData = { ...user };
          delete userData.password;
          userData.loginFrom = 'employee';
          connection.release();
          connection2.release();
          return res.json(userData);
        }

        const userData = { ...employeeResults[0] };
        delete userData.password;
        userData.loginFrom = 'employee';
        connection.release();
        connection2.release();
        return res.json(userData);
      } else {
        // Check gaji_staff table (karyawan)
        const [gajiStaffResults] = await connection.query(
          'SELECT * FROM gaji_staff WHERE nik = ? LIMIT 1',
          [nik]
        );

        if (gajiStaffResults.length === 0) {
          const userData = { ...user };
          delete userData.password;
          userData.loginFrom = 'cms_users';
          connection.release();
          connection2.release();
          return res.json(userData);
        }

        const [karyawanResults] = await connection.query(
          'SELECT * FROM karyawan WHERE nik = ? AND status = "Staff"',
          [nik]
        );

        if (karyawanResults.length === 0) {
          const userData = { ...user };
          delete userData.password;
          userData.loginFrom = 'karyawan';
          connection.release();
          connection2.release();
          return res.json(userData);
        }

        const userData = { ...karyawanResults[0] };
        delete userData.password;
        userData.loginFrom = 'karyawan';
        connection.release();
        connection2.release();
        return res.json(userData);
      }
    } catch (error) {
      connection.release();
      connection2.release();
      console.error('Database query error:', error);
      return res.status(500).send('Database error: ' + error.message);
    }
  } catch (error) {
    console.error('Connection error:', error);
    return res.status(500).send('Database connection error: ' + error.message);
  }
});

app.get(basePath + '/get_slip_gaji/:nik', async (req, res) => {
  const nik = req.params.nik;
  try {
    const [results] = await pool.query('SELECT * FROM gaji WHERE nik = ? ORDER BY periode DESC', [nik]);
    res.json(results);
  } catch (err) {
    console.error('Error querying gaji:', err);
    return res.status(500).send(err.message);
  }
});

app.get(basePath + '/get_slip_gaji_karyawan/:nik', async (req, res) => {
  const nik = req.params.nik;
  try {
    const [results] = await pool.query('SELECT * FROM gaji_staff WHERE nik = ? ORDER BY periode DESC', [nik]);
    res.json(results);
  } catch (err) {
    console.error('Error querying gaji_staff:', err);
    return res.status(500).send(err.message);
  }
});

app.get(basePath + '/get_department/:kode_dept', async (req, res) => {
  const kode_dept = req.params.kode_dept;
  try {
    const [results] = await pool.query(
      'SELECT kode, description FROM kode WHERE category = "DEPARTMENT" AND kode = ?',
      [kode_dept]
    );
    res.json(results);
  } catch (err) {
    console.error('Error querying department:', err);
    return res.status(500).send(err.message);
  }
});

app.get(basePath + '/get_proyek/:kode_proyek', async (req, res) => {
  const kode_proyek = req.params.kode_proyek;
  try {
    const [results] = await pool.query(
      'SELECT kode, description FROM kode WHERE category = "PROYEK" AND kode = ?',
      [kode_proyek]
    );
    res.json(results);
  } catch (err) {
    console.error('Error querying proyek:', err);
    return res.status(500).send(err.message);
  }
});

app.get(basePath + '/get_department_all', async (req, res) => {
  try {
    const [results] = await pool.query('SELECT * FROM departments');
    res.json(results);
  } catch (err) {
    console.error('Error querying departments:', err);
    return res.status(500).send(err.message);
  }
});

// Add this new endpoint to handle staff salary uploads
app.post(basePath + '/upload_staff_salary', async (req, res) => {
  const salaryData = req.body.data;
  
  if (!Array.isArray(salaryData) || salaryData.length === 0) {
    return res.status(400).send('Invalid data format');
  }
  
  try {
    const connection = await pool.getConnection();
    try {
      // Start a transaction
      await connection.beginTransaction();
      
      for (const record of salaryData) {
        // Check if a record with the same NIK and periode already exists
        const [existingRecords] = await connection.query(
          'SELECT * FROM gaji_staff WHERE nik = ? AND periode = ?',
          [record.nik, record.periode]
        );
        
        if (existingRecords.length > 0) {
          // Update existing record
          await connection.query(
            `UPDATE gaji_staff SET 
            nama = ?,
            gaji_pokok = ?,
            tunjangan_tetap = ?,
            tunjangan_jabatan = ?,
            tunjangan_golongan = ?,
            tunjangan_khusus = ?,
            tunjangan_kehadiran = ?,
            tunjangan_bensin = ?,
            tunjangan_lain1 = ?,
            uuck = ?,
            tunjangan_lain2 = ?,
            potongan_bpjs = ?,
            potongan_pph = ?,
            potongan_absen = ?,
            potongan_lain1 = ?,
            potongan_lain2 = ?,
            potongan_koperasi = ?,
            potongan_sdm = ?,
            admin = ?
            WHERE nik = ? AND periode = ?`,
            [
              record.nama || '',
              record.gaji_pokok || 0,
              record.tunjangan_tetap || 0,
              record.tunjangan_jabatan || 0,
              record.tunjangan_golongan || 0,
              record.tunjangan_khusus || 0,
              record.tunjangan_kehadiran || 0,
              record.tunjangan_bensin || 0,
              record.tunjangan_lain1 || 0,
              record.uuck || 0,
              record.tunjangan_lain2 || 0,
              record.potongan_bpjs || 0,
              record.potongan_pph || 0,
              record.potongan_absen || 0,
              record.potongan_lain1 || 0,
              record.potongan_lain2 || 0,
              record.potongan_koperasi || 0,
              record.potongan_sdm || 0,
              record.admin || 0,
              record.nik,
              record.periode
            ]
          );
        } else {
          console.log('Processed record:', record);
          // Insert new record
          await connection.query(
            `INSERT INTO gaji_staff (
              nik, nama, periode, gaji_pokok, tunjangan_tetap, tunjangan_jabatan, 
              tunjangan_golongan, tunjangan_khusus, tunjangan_kehadiran, tunjangan_bensin, 
              tunjangan_lain1, uuck, tunjangan_lain2, potongan_bpjs, potongan_pph, potongan_absen, 
              potongan_lain1, potongan_lain2, potongan_koperasi, potongan_sdm, admin
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              record.nik,
              record.nama || '',
              record.periode,
              record.gaji_pokok || 0,
              record.tunjangan_tetap || 0,
              record.tunjangan_jabatan || 0,
              record.tunjangan_golongan || 0,
              record.tunjangan_khusus || 0,
              record.tunjangan_kehadiran || 0,
              record.tunjangan_bensin || 0,
              record.tunjangan_lain1 || 0,
              record.uuck || 0,
              record.tunjangan_lain2 || 0,
              record.potongan_bpjs || 0,
              record.potongan_pph || 0,
              record.potongan_absen || 0,
              record.potongan_lain1 || 0,
              record.potongan_lain2 || 0,
              record.potongan_koperasi || 0,
              record.potongan_sdm || 0,
              record.admin || 0
            ]
          );
        }
      }
      
      // Commit the transaction
      await connection.commit();
      res.json({ success: true, message: 'Data uploaded successfully', count: salaryData.length });
    } catch (error) {
      // If error, rollback changes
      await connection.rollback();
      console.error('Error in transaction:', error);
      res.status(500).send(`Database error: ${error.message}`);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Connection error:', error);
    res.status(500).send(`Database connection error: ${error.message}`);
  }
});

app.get(basePath + '/get_all_slip_gaji/:nik', async (req, res) => {
  const nik = req.params.nik;
  try {
    // Get data from both tables
    const [gajiResults] = await pool.query('SELECT *, "employee" as source FROM gaji WHERE nik = ? ORDER BY periode DESC', [nik]);
    const [gajiStaffResults] = await pool.query('SELECT *, "staff" as source FROM gaji_staff WHERE nik = ? ORDER BY periode DESC', [nik]);

    // Combine results and sort by periode
    const combinedResults = [...gajiResults, ...gajiStaffResults].sort((a, b) => {
      return new Date(b.periode) - new Date(a.periode);
    });

    res.json(combinedResults);
  } catch (err) {
    console.error('Error querying salary data:', err);
    return res.status(500).send(err.message);
  }
});

app.get(basePath + '/get_wilayah/:kode_wilayah', async (req, res) => {
  const kode_wilayah = req.params.kode_wilayah;
  try {
    const [results] = await pool.query(
      'SELECT kode, description FROM kode WHERE category = "WILAYAH" AND kode = ?',
      [kode_wilayah]
    );
    res.json(results);
  } catch (err) {
    console.error('Error querying wilayah:', err);
    return res.status(500).send(err.message);
  }
});

// Jalankan server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});