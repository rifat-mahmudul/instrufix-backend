const Notification = require("./notification.model");
const User = require("../user/user.model");

exports.getNotifications = async (req, res) => {
  try {
    const { userId, userType } = req.user;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }
    let notify;
    if (userType === "admin") {
      notify = await Notification.find({
        isIgnored: false,
        $or: [{ receiverId: userId }, { userType: "admin" }],
      }).sort({
        createdAt: -1,
      });
    } else {
      notify = await Notification.find({
        receiverId: userId,
        isIgnored: false,
      }).sort({ createdAt: -1 });
    }

    return res.status(200).json({
      status: true,
      message: "Notifications fetched",
      notify,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Error", error: error.message });
  }
};

exports.getAllNotifications = async (req, res) => {
  try {
    const { userId, userType } = req.user;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }
    let notify;
    if (userType === "admin") {
      notify = await Notification.find({
        isRead: false,
        isIgnored: false,
        $or: [{ receiverId: userId }, { userType: "admin" }],
      }).sort({
        createdAt: -1,
      });
    } else {
      notify = await Notification.find({
        receiverId: userId,
        isRead: false,
        isIgnored: false,
      }).sort({
        createdAt: -1,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Notifications fetched",
      notify,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Error", error: error.message });
  }
};

exports.makeIgnore = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Notification.findByIdAndUpdate(
      id,
      { isIgnored: true },
      { new: true },
    );

    return res.status(200).json({
      status: true,
      message: "Notification ignored",
      updated,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Error", error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Notification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true },
    );

    return res.status(200).json({
      status: true,
      message: "Marked as read",
      updated,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Error", error: error.message });
  }
};

exports.markAsAllRead = async (req, res) => {
  try {
    const { userId } = req.user;
    const result = await Notification.updateMany(
      { receiverId: userId, isRead: false },
      { $set: { isRead: true } },
    );

    return res.status(200).json({
      status: true,
      message: "Marked all notifications as read",
      result,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Error", error: error.message });
  }
};

exports.markAsAllReadForAdmin = async (req, res) => {
  try {
    const { userId, userType } = req.user;

    // 🔐 Only admin allowed
    if (userType !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Admin only.",
      });
    }

    // ✅ Only unread notifications update
    const result = await Notification.updateMany(
      {
        isRead: false,
        isIgnored: false,
        $or: [{ receiverId: userId }, { userType: "admin" }],
      },
      { $set: { isRead: true } },
    );

    return res.status(200).json({
      status: true,
      message: "All unread notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Error",
      error: error.message,
    });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    await Notification.findByIdAndDelete(id);

    return res.status(200).json({
      status: true,
      message: "Notification deleted",
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Error", error: error.message });
  }
};
