const express = require('express');
const path = require('path');

const healthRoutes = require('./routes/health.routes');
const tenantRoutes = require('./routes/tenant.routes');
const employeeRoutes = require('./routes/employee.routes');
const departmentRoutes = require('./routes/department.routes');


const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.disable('x-powered-by');

app.use(express.json({ limit: '32kb' }));

// Health
// GET /api/health
app.use('/api', healthRoutes);

// Companies / Wazo tenants
// GET  /api/tenants
// POST /api/tenants
// POST /api/tenants/:uuid/calling-setup
app.use('/api/tenants', tenantRoutes);

// Employees and existing calling-setup inspection
// GET  /api/tenants/:uuid/users
// POST /api/tenants/:uuid/users
// GET  /api/tenants/:uuid/calling-setup
app.use('/api', employeeRoutes);

app.use('/api', departmentRoutes);


// Frontend
app.use(express.static(path.join(__dirname, '../public')));

// Error middleware (must be last)
app.use(errorMiddleware);

module.exports = app;