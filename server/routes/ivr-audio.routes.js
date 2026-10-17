
const router = require('express').Router();
const multer = require('multer');

const controller = require('../controller/ivr-audio.controller');
const wrap = require('../utils/asyncHandler');

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 0,
  },
});

router.post(
  '/tenants/:uuid/ivr-audio',
  upload.single('file'),
  wrap(controller.upload),
);

module.exports = router;
