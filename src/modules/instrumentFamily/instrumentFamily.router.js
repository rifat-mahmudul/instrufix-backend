const { Router } = require('express');
const instrumentController = require('./instrumentFamily.controller');

const router = Router();

//only admin can create
router.post('/create', instrumentController.createInstrument);
router.get('/', instrumentController.getAllInstrument);
router.get('/:id', instrumentController.getInstrumentById);
router.put('/:instrumentId', instrumentController.updateInstrumentName);
router.put('/:instrumentId/type/:typeId', instrumentController.updateInstrument);
router.delete('/:instrumentId', instrumentController.deleteInstrument);

const instrumentFamilyRouter = router;
module.exports = instrumentFamilyRouter;
