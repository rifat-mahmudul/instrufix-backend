const { Router } = require("express");
const userController = require("./user.controller");
const auth = require("../../middleware/auth");
const USER_ROLE = require("./user.constant");
const { upload } = require("../../utils/cloudnary");

const router = Router();

router.post("/register", userController.createNewAccount);
router.post(
  "/verify-email",
  auth(USER_ROLE.businessMan, USER_ROLE.user, USER_ROLE.admin),
  userController.verifyEmail
);

router.post(
  "/resend-otp",
  auth(USER_ROLE.businessMan, USER_ROLE.user, USER_ROLE.admin),
  userController.resendOtpCode
);

router.get(
  "/",
  // auth(USER_ROLE.businessMan, USER_ROLE.user, USER_ROLE.admin),
  userController.getAllUsers
);

router.get(
  "/profile",
  auth(USER_ROLE.businessMan, USER_ROLE.user, USER_ROLE.admin),
  userController.getMyProfile
);

router.put(
  "/update-profile",
  auth(USER_ROLE.businessMan, USER_ROLE.user, USER_ROLE.admin),
  upload.single("image"),
  (req, res, next) => {
    if (req.body?.data) {
      try {
        req.body = JSON.parse(req.body.data);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: "Invalid JSON format in 'data' field",
        });
      }
    }
    next();
  },
  userController.updateUserProfile
);

router.put(
  "/deactive-account",
  auth(USER_ROLE.businessMan, USER_ROLE.user, USER_ROLE.admin),
  userController.deactiveAccount
);

router.delete(
  "/delete-account/:userId",
  auth(USER_ROLE.admin),
  userController.deletedUserAccount
);

router.put("/add-support", userController.addSupport);

router.get(
  "/:userId",
  // auth(USER_ROLE.businessMan, USER_ROLE.user, USER_ROLE.admin),
  userController.getSingleUser
);

router.put(
  "/toggle-status/:userId",
  // auth(USER_ROLE.admin),
  userController.toggleUserStatus
);

const userRouter = router;
module.exports = userRouter;
