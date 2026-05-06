require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Import bcryptjs for cms_users
const crypto = require('crypto'); // Import crypto for SHA-256 hashing

const app = express();
const port = process.env.PORT || 3003;

// Add CORS middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3000/internal-app', 'https://resikcemerlang.com', 'https://resikapps.resikcemerlang.com'],
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
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME_SLIP,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const pool2 = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME_APPS,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Base path for all routes
const basePath = process.env.BASE_PATH || '/internal-app';

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
    const connection2 = await pool2.getConnection();

    try {
      // Check admin table (user table) first - plain text password
      const [adminResults] = await connection.query(
        'SELECT * FROM user WHERE email = ? AND password = ? AND aktif = 1',
        [email, password]
      );

      if (adminResults.length > 0) {
        const adminData = { ...adminResults[0] };

        // Also check resikapps for id_tenant and nik
        const [resikResults] = await connection2.query(
          'SELECT id_user as nik, id_tenant FROM user WHERE email = ?',
          [email]
        );

        if (resikResults.length > 0) {
          adminData.id_tenant = resikResults[0].id_tenant;
          adminData.nik = resikResults[0].nik;
        }

        delete adminData.password;
        adminData.loginFrom = 'admin';
        connection.release();
        connection2.release();
        return res.json(adminData);
      }

      // Check cms_users (user table in resikapps)
      const [results] = await connection2.query(
        'SELECT id_user AS nik, name, email, level, id_tenant FROM user WHERE email = ?',
        [email]
      );

      if (results.length === 0) {
        connection.release();
        connection2.release();
        return res.status(401).send('Email or password incorrect');
      }

      const user = results[0];
      // Get password for comparison
      const [passwordResult] = await connection2.query(
        'SELECT pass FROM user WHERE email = ?',
        [email]
      );
      const dbPassword = passwordResult[0].pass;

      // Hashing pattern: sha256(md5Hex(password))
      const md5Hex = crypto.createHash('md5').update(password).digest('hex');
      const hashedPassword = crypto.createHash('sha256').update(md5Hex).digest('hex');

      const isMatch = (hashedPassword === dbPassword);

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

// Add this new endpoi
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

app.get(basePath + '/get_leave_history/:nik', async (req, res) => {
  const nik = req.params.nik;
  try {
    const [results] = await pool2.query(
      'SELECT nama, tanggal, tanggal_pengajuan, lokasi, alasan, catatan, foto FROM ketidakhadiran WHERE id_user = ? ORDER BY tanggal DESC',
      [nik]
    );
    res.json(results);
  } catch (err) {
    console.error('Error querying leave history:', err);
    return res.status(500).send(err.message);
  }
});

// Get all salary slips for a specific tenant
app.get(basePath + '/get_tenant_slip_gaji/:id_tenant', async (req, res) => {
  const id_tenant = req.params.id_tenant;
  const { start, end } = req.query; // Expecting format YYYYMM
  try {
    const id_region = req.query.id_region;
    // 1. Get active users. If id_tenant is 'all', get all active users.
    let userQuery = `
      SELECT u.id_user, u.name, t.name as tenant_name 
      FROM user u
      LEFT JOIN tenant t ON u.id_tenant = t.id_tenant
      WHERE u.aktif = 1
    `;
    let userParams = [];

    if (id_tenant !== 'all') {
      userQuery += ' AND u.id_tenant = ?';
      userParams.push(id_tenant);
    }

    if (id_region && id_region !== 'all') {
      userQuery += ' AND u.id_region = ?';
      userParams.push(id_region);
    }

    const name = req.query.name;
    if (name) {
      userQuery += ' AND u.name LIKE ?';
      userParams.push(`%${name}%`);
    }

    const [users] = await pool2.query(userQuery, userParams);

    if (users.length === 0) {
      return res.json([]);
    }

    const nicks = users.map(u => u.id_user);
    const userMap = users.reduce((acc, u) => {
      acc[u.id_user] = { name: u.name, tenant: u.tenant_name };
      return acc;
    }, {});

    // 2. Build queries with optional date range
    let gajiQuery = 'SELECT *, "employee" as source FROM gaji WHERE nik IN (?)';
    let gajiStaffQuery = 'SELECT *, "staff" as source FROM gaji_staff WHERE nik IN (?)';
    let params = [nicks];

    if (start && end) {
      gajiQuery += ' AND periode BETWEEN ? AND ?';
      gajiStaffQuery += ' AND periode BETWEEN ? AND ?';
      params.push(start, end);
    } else if (start) {
      gajiQuery += ' AND periode >= ?';
      gajiStaffQuery += ' AND periode >= ?';
      params.push(start);
    } else if (end) {
      gajiQuery += ' AND periode <= ?';
      gajiStaffQuery += ' AND periode <= ?';
      params.push(end);
    }

    gajiQuery += ' ORDER BY periode DESC';
    gajiStaffQuery += ' ORDER BY periode DESC';

    // 3. Get slips from both tables in slip_gaji database
    const [gajiResults] = await pool.query(gajiQuery, params);
    const [gajiStaffResults] = await pool.query(gajiStaffQuery, params);

    // 4. Combine results and ensure names are included
    const combinedResults = [...gajiResults, ...gajiStaffResults].map(slip => ({
      ...slip,
      nama: slip.nama || userMap[slip.nik]?.name || 'Unknown',
      tenant: userMap[slip.nik]?.tenant || 'Unknown'
    })).sort((a, b) => {
      // Sorting by periode string (e.g., "202401")
      return b.periode.localeCompare(a.periode);
    });

    res.json(combinedResults);
  } catch (err) {
    console.error('Error querying tenant salary data:', err);
    return res.status(500).send(err.message);
  }
});

// Get all available tenants
app.get(basePath + '/get_tenants', async (req, res) => {
  try {
    const [results] = await pool2.query('SELECT id_tenant, kode, name FROM tenant ORDER BY name ASC');
    res.json(results);
  } catch (err) {
    console.error('Error querying tenants:', err);
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

// --- Salary Slip Security Endpoints ---

// Check if user has a salary PIN set up
app.get(basePath + '/salary-auth/status/:nik', async (req, res) => {
  const nik = req.params.nik;
  try {
    const [results] = await pool.query(
      'SELECT nik FROM user_security WHERE nik = ?',
      [nik]
    );
    res.json({ hasPin: results.length > 0 });
  } catch (err) {
    console.error('Error checking PIN status:', err);
    return res.status(500).send(err.message);
  }
});

// Verify Salary PIN
app.post(basePath + '/salary-auth/verify', async (req, res) => {
  const { nik, pin } = req.body;
  if (!nik || !pin) {
    return res.status(400).send('NIK and PIN are required');
  }

  try {
    const [results] = await pool.query(
      'SELECT salary_pin FROM user_security WHERE nik = ?',
      [nik]
    );

    if (results.length === 0) {
      return res.status(404).send('PIN not set up');
    }

    const isMatch = await bcrypt.compare(pin, results[0].salary_pin);
    if (isMatch) {
      res.json({ success: true });
    } else {
      res.status(401).send('Invalid PIN');
    }
  } catch (err) {
    console.error('Error verifying PIN:', err);
    return res.status(500).send(err.message);
  }
});

// Create/Set Salary PIN
app.post(basePath + '/salary-auth/create', async (req, res) => {
  const { nik, pin } = req.body;
  if (!nik || !pin) {
    return res.status(400).send('NIK and PIN are required');
  }

  try {
    // Check if PIN already exists
    const [existing] = await pool.query(
      'SELECT nik FROM user_security WHERE nik = ?',
      [nik]
    );

    if (existing.length > 0) {
      return res.status(400).send('PIN already exists for this user');
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    await pool.query(
      'INSERT INTO user_security (nik, salary_pin) VALUES (?, ?)',
      [nik, hashedPin]
    );
    res.json({ success: true, message: 'PIN created successfully' });
  } catch (err) {
    console.error('Error creating PIN:', err);
    return res.status(500).send(err.message);
  }
});

// Get mandatory holidays (Cuti Bersama)
app.get(basePath + '/get_holidays', async (req, res) => {
  try {
    const [results] = await pool2.query(
      'SELECT tanggal, keterangan, is_cuti, tenant FROM libur_2026'
    );
    console.log('Backend Holidays fetched:', results.length, 'entries');
    res.json(results);
  } catch (err) {
    console.error('Error querying holidays:', err);
    return res.status(500).send(err.message);
  }
});


// Get all regions
app.get(basePath + '/get_regions', async (req, res) => {
  try {
    const [results] = await pool2.query(
      'SELECT id_region, name FROM region ORDER BY name ASC'
    );
    res.json(results);
  } catch (err) {
    console.error('Error querying regions:', err);
    return res.status(500).send(err.message);
  }
});

// Jalankan server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
