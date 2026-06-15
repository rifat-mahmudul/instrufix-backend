const config = require("../../config");
const { companyName } = require("../../lib/companyName");
const { createToken } = require("../../utils/tokenGenerate");
const User = require("../user/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const verificationCodeTemplate = require("../../utils/verificationCodeTemplate");
const sendEmail = require("../../utils/sendEmail");

const loginUser = async (payload) => {
  const email = payload.email.trim().toLowerCase();

  // const user = await User.findOne({
  //   email: { $regex: `^${email}$`, $options: "i" },
  // }).select("+password +toFactorAuth +otp +otpExpires");

  const user = await User.findOne({ email }).select(
    "+password +toFactorAuth +otp +otpExpires",
  );

  // console.log(user);

  if (!user) throw new Error("User not found");
  if (user.isDelete === true)
    throw new Error("Your account is deleted. Please contact support.");
  if (!user.isActive)
    throw new Error("Your account is suspended. Please contact support.");

  if (!user.isVerified)
    throw new Error("Please verify your email address first");

  if (user.isDeactivate) {
    //! there are some issues need to be fixed.
    const now = new Date();
    if (now > user.deactivateEndDate) {
      user.isActive = false;
      user.isDeactivate = true;
      await user.save();
      throw new Error("Account permanently deactivated");
    } else {
      user.isDeactivate = false;
      user.deactivateStartDate = null;
      user.deactivateEndDate = null;
      user.deactivateReason = null;
      await user.save();
    }
  }

  const isPasswordValid = await bcrypt.compare(payload.password, user.password);

  if (!isPasswordValid) throw new Error("Invalid password");

  const tokenPayload = {
    userId: user._id,
    email: user.email,
    userType: user.userType,
  };

  const accessToken = createToken(
    tokenPayload,
    config.JWT_SECRET,
    config.JWT_EXPIRES_IN,
  );

  const refreshToken = createToken(
    tokenPayload,
    config.refreshTokenSecret,
    config.jwtRefreshTokenExpiresIn,
  );    

  if (String(user.toFactorAuth) === "true") {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    user.otp = hashedOtp;
    user.otpExpires = otpExpires;
    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: "Your 2FA Verification Code",
        html: verificationCodeTemplate(otp),
      });
    } catch (err) {
      throw new Error("Could not send 2FA verification email");
    }

    // issue is here?..................
    return {
      message: "Please verify your email",
      accessToken,
    };
  }

  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.resetPasswordOtp;
  delete userObj.resetPasswordOtpExpires;
  delete userObj.verificationOtp;
  delete userObj.verificationOtpExpires;
  delete userObj.otp;
  delete userObj.otpExpires;

  return {
    accessToken,
    refreshToken,
    user: userObj,
  };
};

const LoginRefreshToken = async (token) => {
  let decodedToken;

  try {
    decodedToken = jwt.verify(token, config.refreshTokenSecret);

    if (!decodedToken || !decodedToken.email) {
      throw new Error("You are not authorized");
    }
  } catch (error) {
    throw new Error("Unauthorized");
  }

  const email = decodedToken.email;
  const userData = await User.findOne({ email });

  if (!userData) {
    throw new Error("User not found");
  }

  const JwtPayload = {
    userId: userData._id,
    userType: userData.userType,
    email: userData.email,
  };

  const accessToken = createToken(
    JwtPayload,
    config.JWT_SECRET,
    config.JWT_EXPIRES_IN,
  );

  return { accessToken };
};

const forgotPassword = async (email) => {
  if (!email) throw new Error("Email is required");

  const isExistingUser = await User.findOne({ email });
  if (!isExistingUser) throw new Error("User not found");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

  isExistingUser.resetPasswordOtp = hashedOtp;
  isExistingUser.resetPasswordOtpExpires = otpExpires;
  await isExistingUser.save();

  await sendEmail({
    to: email,
    subject: `${companyName} - Password Reset OTP`,
    html: verificationCodeTemplate(otp),
  });

  const JwtToken = {
    userId: isExistingUser._id,
    email: isExistingUser.email,
    userType: isExistingUser.userType,
  };

  const accessToken = createToken(
    JwtToken,
    config.JWT_SECRET,
    config.JWT_EXPIRES_IN,
  );

  return { accessToken };
};

const verifyToken = async (otp, email) => {
  if (!otp) throw new Error("OTP are required");

  const isExistingUser = await User.findOne({ email });
  if (!isExistingUser) throw new Error("User not found");

  if (
    !isExistingUser.resetPasswordOtp ||
    !isExistingUser.resetPasswordOtpExpires
  ) {
    throw new Error("Password reset OTP not requested or has expired");
  }

  if (isExistingUser.resetPasswordOtpExpires < new Date()) {
    throw new Error("Password reset OTP has expired");
  }

  const isOtpMatched = await bcrypt.compare(
    otp.toString(),
    isExistingUser.resetPasswordOtp,
  );
  if (!isOtpMatched) throw new Error("Invalid OTP ");

  isExistingUser.resetPasswordOtp = undefined;
  isExistingUser.resetPasswordOtpExpires = undefined;
  await isExistingUser.save();

  const JwtToken = {
    userId: isExistingUser._id,
    email: isExistingUser.email,
    userType: isExistingUser.userType,
  };

  const accessToken = createToken(
    JwtToken,
    config.JWT_SECRET,
    config.JWT_EXPIRES_IN,
  );

  return { accessToken };
};

const resetPassword = async (payload, email) => {
  if (!payload.newPassword) {
    throw new Error("Email and new password are required");
  }

  const isExistingUser = await User.findOne({ email });
  if (!isExistingUser) throw new Error("User not found");

  // --- CHECK OLD PASSWORD ---
  const isSamePassword = await bcrypt.compare(
    payload.newPassword,
    isExistingUser.password,
  );
  if (isSamePassword) {
    throw new Error("New password must be different from old password");
  }

  const hashedPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcryptSaltRounds),
  );

  const result = await User.findOneAndUpdate(
    { email },
    {
      password: hashedPassword,
      otp: undefined,
      otpExpires: undefined,
    },
    { new: true },
  ).select(
    "-password -otp -otpExpires -resetPasswordOtp -resetPasswordOtpExpires",
  );

  return result;
};

const changePassword = async (payload, email) => {
  const { currentPassword, newPassword } = payload;
  if (!currentPassword || !newPassword) {
    throw new Error("Current and new passwords are required");
  }

  if (currentPassword === newPassword) {
    throw new Error("Passwords must be different");
  }

  const isExistingUser = await User.findOne({ email });
  if (!isExistingUser) throw new Error("User not found");

  const isPasswordMatched = await bcrypt.compare(
    currentPassword,
    isExistingUser.password,
  );
  if (!isPasswordMatched) throw new Error("Invalid current password");

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcryptSaltRounds),
  );

  const result = await User.findOneAndUpdate(
    { email },
    {
      password: hashedPassword,
    },
    { new: true },
  ).select(
    "-password -otp -otpExpires -resetPasswordOtp -resetPasswordOtpExpires",
  );
  return result;
};

const toggleTwoFactorAuthentication = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  user.toFactorAuth = !user.toFactorAuth;
  await user.save();

  return {
    success: true,
    message: `Two-factor authentication ${
      user.toFactorAuth ? "enabled" : "disabled"
    } successfully`,
  };
};

const loginWithToken = async (payload) => {
  const { token } = payload;

  try {
    // Decode and verify the token
    const decoded = jwt.verify(token, config.JWT_SECRET);

    // Make sure the decoded token is the expected shape
    const email = decoded.email;

    const isExistingUser = await User.findOne({ email });

    if (!isExistingUser) throw new Error("User not found");

    const JwtToken = {
      userId: isExistingUser._id,
      email: isExistingUser.email,
      userType: isExistingUser.userType,
    };

    const accessToken = createToken(
      JwtToken,
      config.JWT_SECRET,
      config.JWT_EXPIRES_IN,
    );

    return {
      userId: isExistingUser._id,
      email: isExistingUser.email,
      userType: isExistingUser.userType,
      name: isExistingUser.name,
      accessToken: accessToken,
    };

    // Proceed with your logic
  } catch (error) {
    console.error("JWT Verification failed:", error);
    throw new Error("Invalid token");
  }
};

const clearRestoreFlag = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  const result = await User.findOneAndUpdate(
    { email },
    {
      justRestored: false,
    },
    { new: true },
  );
  return result;
};

const authService = {
  loginUser,
  LoginRefreshToken,
  forgotPassword,
  verifyToken,
  resetPassword,
  changePassword,
  toggleTwoFactorAuthentication,
  loginWithToken,
  clearRestoreFlag,
};

module.exports = authService;
