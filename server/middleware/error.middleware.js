module.exports = (err, req, res, next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 502;
  console.error('[API]', err.status || 500, err.message);
  res.status(status).json({ error: status === 502 ? 'Wazo request failed; check server logs' : err.message });
};
