const { Schema, model, default: mongoose } = require('mongoose');

const businessHoursSchema = new Schema(
  {
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    },
    startTime: { type: String },
    startMeridiem: { type: String },
    endTime: { type: String },
    endMeridiem: { type: String },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const serviceSchema = new Schema(
  {
    newInstrumentName: { type: String, required: true },
    pricingType: {
      type: String,
      enum: ['exact', 'range', 'hourly'],
      // required: true,
    },
    price: { type: Number, default: 0 },
    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    selectedInstrumentsGroup: { type: String, required: true },
    instrumentFamily: { type: String, required: true },
  },
  { _id: false },
);

const musicLessonSchema = new Schema(
  {
    newInstrumentName: { type: String, required: true },
    pricingType: {
      type: String,
      enum: ['exact', 'range', 'hourly'],
      // required: true,
    },
    price: { type: Number, default: 0 },
    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    selectedInstrumentsGroupMusic: { type: String, required: true },
  },
  { _id: false },
);

const businessSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    // adminId: { type: Schema.Types.ObjectId, ref: "User" },
    businessInfo: {
      name: { type: String, required: true },
      image: [
        {
          type: String,
          required: true,
        },
      ],
      address: { type: String, required: true },
      phone: { type: String },
      email: { type: String },
      website: { type: String },
      description: { type: String, required: true },
      postalCode: { type: String },
    },
    services: [serviceSchema],
    musicLessons: [musicLessonSchema],
    businessHours: [businessHoursSchema],
    email: { type: String },
    buyInstruments: { type: Boolean, default: false },
    sellInstruments: { type: Boolean, default: false },
    tradeInstruments: { type: Boolean, default: false },
    rentInstruments: { type: Boolean, default: false },
    isMusicLessons: { type: Boolean, default: false },
    review: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
    reviewImage: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Picture',
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    type: {
      type: String,
      enum: ['myBusiness', 'addABusiness'],
    },
    longitude: { type: Number },
    latitude: { type: Number },
    isVerified: { type: Boolean, default: false },
    isClaimed: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },
    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    isMailVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const Business = model('Business', businessSchema);
module.exports = Business;
