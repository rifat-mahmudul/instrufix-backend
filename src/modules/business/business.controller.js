const { sendImageToCloudinary } = require('../../utils/cloudnary');
const User = require('../user/user.model');
const fs = require('fs');
const Business = require('./business.model');
const ReviewModel = require('../review/review.model');
const PictureModel = require('../picture/picture.model');
const ClaimBussiness = require('../claimBussiness/claimBussiness.model');
const getTimeRange = require('../../utils/getTimeRange');
const SavedBusinessModel = require('../savedBusiness/SavedBusiness.model');
const Notification = require('../notification/notification.model');
const { GOOGLE_API_KEY } = require('../../config');
const axios = require('axios');

exports.createBusiness = async (req, res) => {
  try {
    const { type } = req.query;
    let user = null;

    // ---------- Validation ----------
    if (!type || !['myBusiness', 'addABusiness'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid business type',
      });
    }

    // ---------- Conditional Authentication ----------
    if (type === 'myBusiness') {
      if (!req.user || !req.user.email) {
        return res.status(401).json({
          success: false,
          message: 'Please log in to create a business',
        });
      }

      user = await User.findOne({ email: req.user.email });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }
    }

    const {
      services,
      businessInfo,
      businessHours,
      longitude,
      latitude,
      musicLessons,
      email,
      ...rest
    } = req.body;

    // ---------- Files Validation ----------
    const files = req.files;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded',
      });
    }

    // ---------- Upload Images ----------
    const image = await Promise.all(
      files.map(async (file) => {
        const imageName = `business/${Date.now()}_${file.originalname}`;
        const result = await sendImageToCloudinary(imageName, file.path);
        fs.unlinkSync(file.path);
        return result.secure_url;
      }),
    );

    // ---------- Create Business (NO AUTO APPROVAL) ----------
    const business = await Business.create({
      ...rest,
      type,
      userId: user ? user._id : null,
      businessInfo: {
        ...businessInfo,
        image,
      },
      services,
      musicLessons,
      businessHours,
      longitude,
      latitude,
      isVerified: false,
      status: 'pending',
      email: type === 'addABusiness' ? email : null,
      isClaimed: type === 'addABusiness' ? false : true,
    });

    // ---------- AUTO CLAIM (ONLY myBusiness, BUT NOT VERIFIED) ----------
    if (type === 'myBusiness' && user) {
      await ClaimBussiness.create({
        businessId: business._id,
        userId: user._id,
        isVerified: false,
      });
    }

    let placeReviews = [];
    let placeId = null;

    try {
      // STEP 1: Geocoding API → Get Place ID
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        `${businessInfo.name} ${businessInfo.address}`,
      )}&key=${GOOGLE_API_KEY}`;

      const geoResponse = await axios.get(geoUrl);

      if (geoResponse.data.status === 'OK' && geoResponse.data.results.length > 0) {
        placeId = geoResponse.data.results[0].place_id;
        const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}`;

        const detailsResponse = await axios.get(detailsUrl, {
          headers: {
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'displayName,rating,reviews',
          },
        });

        const reviews = detailsResponse.data.reviews || [];

        if (reviews.length > 0) {
          placeReviews = reviews.slice(0, 5).map((r) => ({
            rating: r.rating || 0,
            feedback: r.originalText?.text || r.text?.text || 'No feedback',
            user: null,
            business: business._id,
            googlePlaceId: placeId,
            status: 'approved',
            googleAuthorName: r.authorAttribution?.displayName || '',
            googleAuthorPhoto: r.authorAttribution?.photoUri || '',
          }));
        }
      }
    } catch (err) {
      console.warn('Google review fetch failed:', err.response?.data || err.message);
    }

    if (placeReviews.length > 0) {
      const savedReviews = await ReviewModel.insertMany(placeReviews);
      business.review = savedReviews.map((r) => r._id);
      await business.save();
    }

    // ---------- ADMIN NOTIFICATION (SINGLE ADMIN, NO LOOP) ----------
    const admin = await User.findOne({ userType: 'admin' });
    if (admin) {
      const alreadyNotified = await Notification.findOne({
        receiverId: admin._id,
        type: 'new_business',
        'metadata.businessId': business._id,
      });

      if (!alreadyNotified) {
        await Notification.create({
          senderId: user ? user._id : null,
          receiverId: admin._id,
          userType: 'admin',
          type: 'new_business',
          title:
            type === 'myBusiness'
              ? `A business ${businessInfo.name} was submitted by ${user.name}`
              : `A business ${businessInfo.name} was added.`,
          message:
            type === 'myBusiness'
              ? `User ${user.name} submitted their business ${businessInfo.name} for approval.`
              : `A business ${businessInfo.name} was added and requires approval.`,
          metadata: {
            businessId: business._id,
            businessType: type,
          },
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Business submitted for admin approval',
      business,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// exports.getAllBusinesses = async (req, res) => {
//   try {
//     const {
//       search,
//       searchLocation,
//       instrumentFamily,
//       selectedInstrumentsGroup,
//       newInstrumentName,
//       minPrice,
//       maxPrice,
//       buyInstruments,
//       sellInstruments,
//       offerMusicLessons,
//       tradeInstruments,
//       rentInstruments,
//       isMusicLessons,
//       sort,
//       openNow,
//       postalCode,
//       page = 1,
//       limit = 40,
//     } = req.query;

//     const pageNumber = parseInt(page);
//     const limitNumber = parseInt(limit);
//     const skip = (pageNumber - 1) * limitNumber;

//     let query = { status: 'approved', $and: [] };

//     const toRegexArray = (value) => {
//       const arr = Array.isArray(value) ? value : [value];
//       return arr.map((v) => new RegExp(v.toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
//     };

//     /* ---------------- SEARCH FILTERS ---------------- */
//     if (search) {
//       const regexArr = toRegexArray(search);
//       query.$and.push({
//         $or: regexArr.flatMap((regex) => [
//           { 'businessInfo.name': regex },
//           // { "businessInfo.address": regex },
//           { 'services.newInstrumentName': regex },
//           { 'musicLessons.newInstrumentName': regex },
//           { 'services.instrumentFamily': regex },
//         ]),
//       });
//     }

//     if (searchLocation) {
//       const arr = Array.isArray(searchLocation) ? searchLocation : [searchLocation];

//       const locationConditions = arr.map((loc) => {
//         const escaped = loc.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

//         // Match the location:
//         // - Anywhere after a comma+space (handles street prefix before it)
//         // - OR at the very start of the string
//         // - Followed optionally by a zip code
//         // - Followed by comma or end of string
//         const exactPattern = `(?:^|,\\s*)\\s*${escaped}(\\s+\\d{5}(-\\d{4})?)?\\s*(?:,|$)`;

//         return {
//           'businessInfo.address': new RegExp(exactPattern, 'i'),
//         };
//       });

//       query.$and.push({ $or: locationConditions });
//     }

//     if (postalCode) {
//       const regexArr = toRegexArray(postalCode);
//       query.$and.push({
//         $or: regexArr.map((regex) => ({
//           'businessInfo.address': regex,
//         })),
//       });
//     }

//     if (instrumentFamily) {
//       const regexArr = toRegexArray(instrumentFamily);
//       query.$and.push({
//         $or: regexArr.map((regex) => ({
//           'services.instrumentFamily': regex,
//         })),
//       });
//     }

//     if (selectedInstrumentsGroup) {
//       const regexArr = toRegexArray(selectedInstrumentsGroup);
//       query.$and.push({
//         $or: regexArr.flatMap((regex) => [
//           { 'services.selectedInstrumentsGroup': regex },
//           { 'musicLessons.selectedInstrumentsGroupMusic': regex },
//         ]),
//       });
//     }

//     if (newInstrumentName) {
//       const regexArr = toRegexArray(newInstrumentName);
//       query.$and.push({
//         $or: regexArr.flatMap((regex) => [
//           { 'services.newInstrumentName': regex },
//           { 'musicLessons.newInstrumentName': regex },
//         ]),
//       });
//     }

//     /* ---------------- FLAGS ---------------- */

//     if (buyInstruments === 'true') query.buyInstruments = true;
//     if (sellInstruments === 'true') query.sellInstruments = true;
//     if (offerMusicLessons === 'true') query.offerMusicLessons = true;
//     if (tradeInstruments === 'true') query.tradeInstruments = true;
//     if (rentInstruments === 'true') query.rentInstruments = true;
//     if (isMusicLessons === 'true') query.isMusicLessons = true;

//     if (query.$and.length === 0) delete query.$and;

//     /* ---------------- FETCH FROM DB ---------------- */
//     const totalCount = await Business.countDocuments(query);

//     let businesses = await Business.find(query)
//       .populate({
//         path: 'review',
//         options: { sort: { createdAt: -1 } },
//       })
//       .skip(skip)
//       .limit(limitNumber)
//       .lean();

//     /* ---------------- PRICE FILTER (JS SIDE) ---------------- */

//     const hasMin = minPrice !== undefined && minPrice !== '';
//     const hasMax = maxPrice !== undefined && maxPrice !== '';

//     if (hasMin || hasMax) {
//       const min = hasMin ? Number(minPrice) : 0;
//       const max = hasMax ? Number(maxPrice) : Number.MAX_SAFE_INTEGER;

//       businesses = businesses.filter((b) => {
//         const items = [...(b.services || []), ...(b.musicLessons || [])];

//         return items.some((item) => {
//           // RANGE pricing
//           if (item.pricingType === 'range') {
//             const itemMin = Number(item.minPrice);
//             const itemMax = Number(item.maxPrice);
//             if (isNaN(itemMin) || isNaN(itemMax)) return false;

//             // STRICT minPrice logic
//             const minPass = itemMin >= min;
//             const maxPass = itemMax <= max;
//             if (hasMin && hasMax) return minPass && maxPass;
//             if (hasMin) return minPass;
//             if (hasMax) return itemMax <= max;
//           }

//           // EXACT pricing
//           const price = Number(item.price);
//           if (isNaN(price)) return false;

//           if (hasMin && hasMax) return price >= min && price <= max;
//           if (hasMin) return price >= min;
//           if (hasMax) return price <= max;
//         });
//       });
//     }

//     /* ---------------- OPEN NOW ---------------- */

//     if (openNow === 'true') {
//       const now = new Date();
//       const day = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
//       const currentMinutes = now.getHours() * 60 + now.getMinutes();

//       businesses = businesses.filter((b) => {
//         const today = b.businessHours?.find((h) => h.day.toLowerCase() === day && h.enabled);
//         if (!today) return false;

//         const start =
//           parseInt(today.startTime.split(':')[0]) * 60 + parseInt(today.startTime.split(':')[1]);
//         const end =
//           parseInt(today.endTime.split(':')[0]) * 60 + parseInt(today.endTime.split(':')[1]);

//         return currentMinutes >= start && currentMinutes <= end;
//       });
//     }

//     /* ---------------- SORT ---------------- */

//     if (sort) {
//       const getMinPrice = (b) => {
//         const prices = [...(b.services || []), ...(b.musicLessons || [])]
//           .map((x) => (x.pricingType === 'range' ? Number(x.minPrice) : Number(x.price)))
//           .filter((n) => !isNaN(n));

//         return prices.length ? Math.min(...prices) : Infinity;
//       };

//       businesses.sort((a, b) =>
//         sort === 'high-to-low' ? getMinPrice(b) - getMinPrice(a) : getMinPrice(a) - getMinPrice(b),
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       data: businesses,
//       pagination: {
//         total: totalCount,
//         page: pageNumber,
//         limit: limitNumber,
//         totalPages: Math.ceil(totalCount / limitNumber),
//       },
//     });
//   } catch (error) {
//     return res.status(500).json({ success: false, error: error.message });
//   }
// };

exports.getAllBusinesses = async (req, res) => {
  try {
    const {
      search,
      searchLocation,
      instrumentFamily,
      selectedInstrumentsGroup,
      newInstrumentName,
      minPrice,
      maxPrice,
      buyInstruments,
      sellInstruments,
      offerMusicLessons,
      tradeInstruments,
      rentInstruments,
      isMusicLessons,
      sort,
      openNow,
      currentDay,
      currentMinutes,
      postalCode,
      page = 1,
      limit = 40,
    } = req.query;

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    let query = { status: 'approved', $and: [] };

    const toRegexArray = (value) => {
      const arr = Array.isArray(value) ? value : [value];
      return arr.map((v) => new RegExp(v.toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    };

    /* ---------------- SEARCH FILTERS ---------------- */

    if (search) {
      const regexArr = toRegexArray(search);
      query.$and.push({
        $or: regexArr.flatMap((regex) => [
          { 'businessInfo.name': regex },
          { 'services.newInstrumentName': regex },
          { 'musicLessons.newInstrumentName': regex },
          { 'services.instrumentFamily': regex },
        ]),
      });
    }

    if (searchLocation) {
      const arr = Array.isArray(searchLocation) ? searchLocation : [searchLocation];

      const locationConditions = arr.map((loc) => {
        const escaped = loc.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const exactPattern = `(?:^|,\\s*)\\s*${escaped}(\\s+\\d{5}(-\\d{4})?)?\\s*(?:,|$)`;

        return {
          'businessInfo.address': new RegExp(exactPattern, 'i'),
        };
      });

      query.$and.push({ $or: locationConditions });
    }

    if (postalCode) {
      const regexArr = toRegexArray(postalCode);
      query.$and.push({
        $or: regexArr.map((regex) => ({
          'businessInfo.address': regex,
        })),
      });
    }

    if (instrumentFamily) {
      const regexArr = toRegexArray(instrumentFamily);
      query.$and.push({
        $or: regexArr.map((regex) => ({
          'services.instrumentFamily': regex,
        })),
      });
    }

    if (selectedInstrumentsGroup) {
      const regexArr = toRegexArray(selectedInstrumentsGroup);
      query.$and.push({
        $or: regexArr.flatMap((regex) => [
          { 'services.selectedInstrumentsGroup': regex },
          { 'musicLessons.selectedInstrumentsGroupMusic': regex },
        ]),
      });
    }

    if (newInstrumentName) {
      const regexArr = toRegexArray(newInstrumentName);
      query.$and.push({
        $or: regexArr.flatMap((regex) => [
          { 'services.newInstrumentName': regex },
          { 'musicLessons.newInstrumentName': regex },
        ]),
      });
    }

    /* ---------------- FLAGS ---------------- */

    if (buyInstruments === 'true') query.buyInstruments = true;
    if (sellInstruments === 'true') query.sellInstruments = true;
    if (offerMusicLessons === 'true') query.isMusicLessons = true;
    if (tradeInstruments === 'true') query.tradeInstruments = true;
    if (rentInstruments === 'true') query.rentInstruments = true;
    if (isMusicLessons === 'true') query.isMusicLessons = true;

    if (query.$and.length === 0) delete query.$and;

    /* ---------------- FETCH FROM DB ---------------- */

    let businesses = await Business.find(query)
      .populate({
        path: 'review',
        options: { sort: { createdAt: -1 } },
      })
      .lean();

    /* ---------------- REVIEW LOGIC ---------------- */

    businesses = businesses.map((business) => {
      const allReviews = business.review || [];

      // Customer reviews (Google review না)
      const customerReviews = allReviews.filter(
        (review) => !review.googleAuthorName && review.status === 'approved',
      );

      // Google reviews
      const googleReviews = allReviews.filter((review) => review.googleAuthorName);

      return {
        ...business,

        review:
          customerReviews.length >= 3 ? customerReviews : [...customerReviews, ...googleReviews],
      };
    });

    /* ---------------- PRICE FILTER ---------------- */

    const hasMin = minPrice !== undefined && minPrice !== '';
    const hasMax = maxPrice !== undefined && maxPrice !== '';

    if (hasMin || hasMax) {
      const min = hasMin ? Number(minPrice) : 0;
      const max = hasMax ? Number(maxPrice) : Number.MAX_SAFE_INTEGER;

      businesses = businesses.filter((b) => {
        const items = [...(b.services || []), ...(b.musicLessons || [])];

        return items.some((item) => {
          if (item.pricingType === 'range') {
            const itemMin = Number(item.minPrice);
            const itemMax = Number(item.maxPrice);

            if (isNaN(itemMin) || isNaN(itemMax)) return false;

            const minPass = itemMax >= min;
            const maxPass = itemMin <= max;

            if (hasMin && hasMax) return minPass && maxPass;
            if (hasMin) return minPass;
            if (hasMax) return maxPass;
          }

          const price = Number(item.price);

          if (isNaN(price)) return false;

          if (hasMin && hasMax) return price >= min && price <= max;
          if (hasMin) return price >= min;
          if (hasMax) return price <= max;

          return false;
        });
      });
    }

    /* ---------------- OPEN NOW ---------------- */

    if (openNow === 'true') {
      const now = new Date();
      const day =
        currentDay?.toString().toLowerCase() ||
        now
          .toLocaleString('en-us', {
            weekday: 'long',
          })
          .toLowerCase();

      const parsedCurrentMinutes =
        currentMinutes !== undefined && currentMinutes !== '' ? Number(currentMinutes) : null;
      const currentMinutesValue = Number.isNaN(parsedCurrentMinutes)
        ? now.getHours() * 60 + now.getMinutes()
        : parsedCurrentMinutes ?? now.getHours() * 60 + now.getMinutes();

      const normalizeDay = (value) => value?.toString().trim().toLowerCase();

      const toMinutes = (time, meridiem) => {
        if (!time) return null;

        const match = time
          .toString()
          .trim()
          .match(/^(\d{1,2})(?::(\d{1,2}))?\s*([ap]\.?\s*m\.?)?$/i);

        if (!match) return null;

        let hour = Number(match[1]);
        const minute = Number(match[2] || 0);

        if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

        const normalizedMeridiem = (match[3] || meridiem || '')
          .toString()
          .replace(/\s|\./g, '')
          .toLowerCase();

        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
        if (normalizedMeridiem === 'pm' && hour < 12) hour += 12;
        if (normalizedMeridiem === 'am' && hour === 12) hour = 0;

        return hour * 60 + minute;
      };

      businesses = businesses.filter((b) => {
        const today = b.businessHours?.find(
          (h) => normalizeDay(h.day) === normalizeDay(day) && h.enabled !== false,
        );

        if (!today) return false;

        const start = toMinutes(today.startTime, today.startMeridiem);
        const end = toMinutes(today.endTime, today.endMeridiem);

        if (start === null || end === null) return false;

        if (end < start) return currentMinutesValue >= start || currentMinutesValue <= end;

        return currentMinutesValue >= start && currentMinutesValue <= end;
      });
    }

    /* ---------------- SORT ---------------- */

    if (sort) {
      const getMinPrice = (b) => {
        const prices = [...(b.services || []), ...(b.musicLessons || [])]
          .map((x) => {
            if (x.pricingType === 'range') return Number(x.minPrice);
            return Number(x.price);
          })
          .filter((n) => !Number.isNaN(n));

        return prices.length ? Math.min(...prices) : null;
      };

      const comparePrices = (a, b, direction) => {
        const priceA = getMinPrice(a);
        const priceB = getMinPrice(b);

        if (priceA === null && priceB === null) return 0;
        if (priceA === null) return 1;
        if (priceB === null) return -1;

        return direction === 'desc' ? priceB - priceA : priceA - priceB;
      };

      const getAverageRating = (b) => {
        const ratings = (b.review || [])
          .map((review) => Number(review.rating))
          .filter((rating) => !Number.isNaN(rating));

        if (!ratings.length) return 0;

        return ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
      };

      if (sort === 'high-to-low') {
        businesses.sort((a, b) => comparePrices(a, b, 'desc'));
      }

      if (sort === 'low-to-high') {
        businesses.sort((a, b) => comparePrices(a, b, 'asc'));
      }

      if (sort === 'rating-high-to-low') {
        businesses.sort((a, b) => getAverageRating(b) - getAverageRating(a));
      }

      if (sort === 'rating-low-to-high') {
        businesses.sort((a, b) => getAverageRating(a) - getAverageRating(b));
      }
    }

    const totalCount = businesses.length;
    const paginatedBusinesses = businesses.slice(skip, skip + limitNumber);

    return res.status(200).json({
      success: true,
      data: paginatedBusinesses,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.getBusinessById = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Fetch business
    const business = await Business.findById(businessId)
      .populate('services')
      .populate('musicLessons')
      .populate({
        path: 'review',
        populate: {
          path: 'user',
          select: 'name email imageLink',
        },
      });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found',
      });
    }

    // =========================================================
    // REVIEW FILTER LOGIC
    // =========================================================

    // Genuine reviews = reviews added by your platform users
    // Google reviews = reviews having googlePlaceId

    const allReviews = business.review || [];

    const genuineReviews = allReviews.filter(
      (review) => !review.googlePlaceId && review.status === 'approved',
    );

    const googleReviews = allReviews.filter((review) => review.googlePlaceId);

    // If genuine approved reviews >= 3
    // then DO NOT show Google reviews
    let finalReviews = [];

    if (genuineReviews.length >= 3) {
      finalReviews = genuineReviews;
    } else {
      // Otherwise show all reviews
      finalReviews = allReviews;
    }

    // =========================================================
    // Fetch ONLY approved claim
    // =========================================================

    const claim = await ClaimBussiness.findOne({
      businessId,
      status: 'approved',
    });

    // =========================================================
    // Fetch approved review images
    // =========================================================

    const reviews = await ReviewModel.find({
      business: businessId,
      status: 'approved',
    }).select('image');

    const reviewImages = reviews.flatMap((r) => r.image || []);

    // =========================================================
    // Fetch approved picture images
    // =========================================================

    const pictures = await PictureModel.find({
      business: businessId,
      status: 'approved',
    }).select('image');

    const pictureImages = pictures.flatMap((p) => p.image || []);

    // =========================================================
    // Combine all images
    // =========================================================

    const allImages = [...(business.businessInfo?.image || []), ...reviewImages, ...pictureImages];

    // =========================================================
    // Fetch user-added photos with user info
    // =========================================================

    const userAddPhotos = await PictureModel.find({
      business: businessId,
      status: 'approved',
    })
      .populate('user', 'name imageLink')
      .select('image user createdAt');

    const userPhotoMap = {};

    userAddPhotos.forEach((photo) => {
      const userId = photo.user?._id?.toString() || 'anonymous';

      if (!userPhotoMap[userId]) {
        userPhotoMap[userId] = {
          addedBy: {
            name: photo.user?.name || 'Anonymous',
            profilePhoto: photo.user?.imageLink || null,
          },
          images: [],
        };
      }

      userPhotoMap[userId].images.push(...(photo.image || []));
    });

    const userAddedPhotos = Object.values(userPhotoMap);

    // =========================================================
    // Final response object
    // =========================================================

    const businessWithDetails = {
      ...business.toObject(),

      // Replace review with filtered review list
      review: finalReviews,

      // DO NOT override isClaimed
      isClaimed: business.isClaimed,

      claimInfo: claim
        ? {
            userId: claim.userId,
            status: claim.status,
            isVerified: claim.isVerified,
            documents: claim.documents,
          }
        : null,

      images: allImages,
      userAddedPhotos,
    };

    // =========================================================
    // Send response
    // =========================================================

    return res.status(200).json({
      success: true,
      message: 'Business fetched successfully',
      data: businessWithDetails,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getBusinessesByUser = async (req, res) => {
  try {
    const { userId } = req.user;

    // pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const isExist = await User.findById(userId);
    if (!isExist) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const [businesses, total] = await Promise.all([
      Business.find({ userId: isExist._id }).skip(skip).limit(limit).sort({ createdAt: -1 }),
      Business.countDocuments({ userId: isExist._id }),
    ]);

    if (businesses.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No businesses found for this user',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Your businesses fetched successfully',
      data: businesses,
      meta: {
        totalItems: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyApprovedBusinesses = async (req, res) => {
  try {
    const { email } = req.user;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const businesses = await Business.find({
      status: 'approved',
      $or: [{ email: user.email }, { userId: user._id }],
    });

    // console.log("Found businesses:", businesses);
    if (!businesses) {
      return res.status(404).json({
        success: false,
        message: 'No businesses found for this user',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Your businesses fetched successfully',
      data: businesses,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDashboardData = async (req, res) => {
  try {
    const { range = 'day' } = req.query;

    // Set start date based on range
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (range === 'week') {
      start.setDate(start.getDate() - 7); // last 7 days
    } else if (range === 'month') {
      start.setDate(1); // start of current month
    }

    // Helper function to count total and new items
    const countData = async (Model, extraFilter = {}) => {
      const total = await Model.countDocuments(extraFilter);
      const newCount = await Model.countDocuments({
        ...extraFilter,
        createdAt: { $gte: start },
      });
      return { total, new: newCount };
    };

    // ====== Count total & new ======
    const businesses = await countData(Business);
    const reviews = await countData(ReviewModel);
    const photos = await countData(PictureModel);
    const claims = await countData(ClaimBussiness);
    const users = await countData(User);

    // ====== Count pending / submissions ======
    const businessSubmissions = await countData(Business, {
      status: 'pending',
    });
    const reviewSubmissions = await countData(ReviewModel, {
      status: 'pending',
    });
    const photoSubmissions = await countData(PictureModel, {
      status: 'pending',
    });
    const claimRequests = await countData(ClaimBussiness, {
      status: 'pending',
    });
    const profilesUnderReview = await countData(User, { status: 'pending' });

    // ====== Dashboard response ======
    const dashboardData = {
      businesses,
      reviews,
      photos,
      claims,
      users,
      businessSubmissions,
      reviewSubmissions,
      photoSubmissions,
      claimRequests,
      profilesUnderReview,
    };

    return res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: dashboardData,
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getBusinessmanDashboardData = async (req, res) => {
  try {
    const { range = 'day' } = req.query;
    const { userId } = req.user;

    if (req.user.userType !== 'businessMan') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Step 1: Find all businesses owned by the user
    const businesses = await Business.find({ user: userId }).select('_id businessInfo.name');
    const savedBusiness = await SavedBusinessModel.find({
      user: userId,
    }).select('_id savedBusiness businessInfo.name');
    const businessIds = businesses.map((b) => b._id);
    const savedBusinessIds = savedBusiness.map((b) => b.savedBusiness);
    // console.log(savedBusinessIds);

    const startDate = getTimeRange(range);

    const queryWithDate = { $gte: startDate };
    const [totalReviews, totalPhotos, totalSaves, recentReviews] = await Promise.all([
      // Only reviews of my businesses
      ReviewModel.countDocuments({
        business: { $in: businessIds },
        createdAt: queryWithDate,
      }),

      ReviewModel.countDocuments({
        business: { $in: businessIds },
        createdAt: queryWithDate,
        reviewImage: { $exists: true, $ne: [] },
      }),
      // Only photos for my businesses
      // PictureModel.countDocuments({
      //   business: { $in: businessIds },
      //   createdAt: queryWithDate,
      // }),

      SavedBusinessModel.countDocuments({
        savedBusiness: { $in: savedBusinessIds },
        user: userId,
        createdAt: queryWithDate,
      }),
      // Fetch latest reviews for my businesses
      ReviewModel.find({
        business: { $in: businessIds },
        createdAt: queryWithDate,
      })
        .populate('user', 'name profilePhoto')
        .populate('business', 'businessInfo.name')
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    return res.status(200).json({
      success: true,
      message: `Dashboard data (${range}) for businessman`,
      data: {
        reviews: totalReviews,
        photos: totalPhotos,
        saves: totalSaves,
        latestReviews: recentReviews.map((r) => ({
          id: r._id,
          rating: r.rating,
          comment: r.comment,
          date: r.createdAt,
          user: {
            name: r.user?.name,
            profilePhoto: r.user?.profilePhoto || null,
          },
          business: {
            id: r.business?._id,
            name: r.business?.businessInfo?.name || 'N/A',
          },
        })),
      },
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllBusinessesByAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, businessType, time = 'all', sortBy = 'latest' } = req.query;

    const pageNumber = Math.max(1, parseInt(page));
    const pageSize = Math.max(1, parseInt(limit));

    const filter = {};
    const sortOption = {};

    if (businessType && ['pending', 'approved', 'rejected'].includes(businessType.toLowerCase())) {
      filter.status = businessType.toLowerCase();
    }

    if (time && ['last-7', 'last-30'].includes(time)) {
      const now = new Date();
      let fromDate = new Date();

      if (time === 'last-7') {
        fromDate.setDate(now.getDate() - 7);
      } else if (time === 'last-30') {
        fromDate.setDate(now.getDate() - 30);
      }

      filter.createdAt = { $gte: fromDate };
    }

    let businessesQuery = Business.find(filter).select('businessInfo user status createdAt');
    // .populate("user", "name email");

    if (['latest', 'oldest'].includes(sortBy)) {
      sortOption.createdAt = sortBy === 'latest' ? -1 : 1;
    } else if (sortBy === 'A-Z') {
      sortOption['businessInfo.name'] = 1;
      businessesQuery = businessesQuery.collation({
        locale: 'en',
        strength: 2,
      });
    } else if (sortBy === 'Z-A') {
      sortOption['businessInfo.name'] = -1;
      businessesQuery = businessesQuery.collation({
        locale: 'en',
        strength: 2,
      });
    }

    const totalCount = await Business.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / pageSize);

    if (sortBy === 'status') {
      const allBusinesses = await businessesQuery;

      const statusOrder = { pending: 1, approved: 2, rejected: 3 };

      const sortedBusinesses = allBusinesses.sort((a, b) => {
        const statusCompare = statusOrder[a.status] - statusOrder[b.status];
        if (statusCompare !== 0) return statusCompare;

        return a.businessInfo.name.localeCompare(b.businessInfo.name, 'en', {
          sensitivity: 'base',
        });
      });

      const paginated = sortedBusinesses.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      return res.status(200).json({
        success: true,
        message: 'Businesses fetched successfully',
        data: paginated,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          totalPages,
          totalCount,
        },
      });
    }

    const businesses = await businessesQuery
      .sort(sortOption)
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.status(200).json({
      success: true,
      message: 'Businesses fetched successfully',
      data: businesses,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalPages,
        totalCount,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message,
      error,
    });
  }
};

exports.toggleBusinessStatus = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { status } = req.body;

    // ---------- Validate Status ----------
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'approved' or 'rejected'.",
      });
    }

    // ---------- Find Business ----------
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found.',
      });
    }

    // ---------- Update Status ----------
    business.status = status;
    await business.save();

    const ownerEmail = business.email || business.businessInfo?.email;
    const owner = business.userId
      ? await User.findById(business.userId)
      : ownerEmail
        ? await User.findOne({ email: ownerEmail })
        : null;
    if (owner) {
      const alreadyNotified = await Notification.findOne({
        receiverId: owner._id,
        type: `business_${status}`,
        'metadata.businessId': business._id,
      });

      if (!alreadyNotified) {
        const io = req.app.get('io');
        // ---------- Create Notification ----------
        const notify = await Notification.create({
          senderId: null, // system/admin
          receiverId: owner._id,
          userType: owner.userType || 'user',
          type: `business_${status}`,
          title: status === 'approved' ? 'Business Approved' : 'Business Rejected',
          message:
            status === 'approved'
              ? `Your business ${business.businessInfo?.name || 'Business'} has been approved.`
              : `Your business ${business.businessInfo?.name || 'Business'} has been rejected. `,
          metadata: {
            businessId: business._id,
            status,
          },
        });

        io.to(`${owner._id}`).emit('new_notification', notify);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Business status updated to ${status}`,
      data: business,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const files = req.files;
    const { user, userType } = req.user;

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found.',
      });
    }

    let image = [];
    if (files && Array.isArray(files) && files.length > 0) {
      image = await Promise.all(
        files.map(async (file) => {
          const imageName = `business/${Date.now()}_${file.originalname}`;
          const result = await sendImageToCloudinary(imageName, file.path);
          return result.secure_url;
        }),
      );
    }

    // Prepare update payload
    const updatePayload = { ...req.body };

    // Append new images to existing ones instead of replacing
    if (image.length > 0) {
      if (!updatePayload.businessInfo) {
        updatePayload.businessInfo = {};
      }

      const existingImages = business.businessInfo?.image || [];
      updatePayload.businessInfo.image = [...existingImages, ...image];
    }

    const updatedBusiness = await Business.findByIdAndUpdate(
      businessId,
      { $set: updatePayload },
      { new: true },
    );

    const adminUsers = await User.find({ userType: 'admin' });
    const io = req.app.get('io');

    // Notify Admins
    for (const admin of adminUsers) {
      const notify = await Notification.create({
        senderId: user._id,
        receiverId: admin._id,
        userType: 'admin',
        type: 'new_business_updated',
        title: 'Business Updated',
        message: `${user.name || 'A user'} updated a business.`,
        metadata: { businessId: business._id },
      });
      io.to(`${admin._id}`).emit('new_notification', notify);
    }

    // Notify Business Owner
    const notifyUser = await Notification.create({
      senderId: user._id,
      receiverId: user._id,
      userType: userType,
      type: 'business_update',
      title: 'Business Updated',
      message: `You have successfully updated your business.`,
      metadata: { businessId: business._id },
    });
    io.to(`${user._id}`).emit('new_notification', notifyUser);

    return res.status(200).json({
      success: true,
      message: 'Business updated successfully',
      data: updatedBusiness,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
      error,
    });
  }
};

exports.removedImage = async (req, res) => {
  try {
    const { businessId, imageIndex } = req.params;
    const index = parseInt(imageIndex, 10);
    const { user, userType } = req.user;
    const io = req.app.get('io');

    if (isNaN(index)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image index',
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found.',
      });
    }

    if (!business.businessInfo.image || business.businessInfo.image.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images to remove',
      });
    }

    if (index < 0 || index >= business.businessInfo.image.length) {
      return res.status(400).json({
        success: false,
        message: 'Image index out of range',
      });
    }

    const updatedImages = [...business.businessInfo.image];
    updatedImages.splice(index, 1);

    const updatedBusiness = await Business.findByIdAndUpdate(
      businessId,
      { $set: { 'businessInfo.image': updatedImages } },
      { new: true, runValidators: false },
    );

    const adminUsers = await User.find({ userType: 'admin' });

    for (const admin of adminUsers) {
      const notify = await Notification.create({
        senderId: user._id,
        receiverId: admin._id,
        userType: 'admin',
        type: 'business_image_removed',
        title: 'Image Removed from Business',
        message: `${user.name || 'A user'} removed an image from their business.`,
        metadata: { businessId: business._id },
      });

      io.to(`${admin._id}`).emit('new_notification', notify);
    }

    // Notify Business Owner
    const notifyUser = await Notification.create({
      senderId: user._id,
      receiverId: user._id,
      userType: userType,
      type: 'image_removed',
      title: 'Business Image Removed',
      message: 'You have successfully removed an image from your business.',
      metadata: { businessId: business._id },
    });

    io.to(`${user._id}`).emit('new_notification', notifyUser);

    return res.status(200).json({
      success: true,
      message: 'Image removed successfully',
      data: updatedBusiness,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
      error,
    });
  }
};

exports.getEveryInstrumentService = async (req, res) => {
  try {
    const allBusinesses = await Business.find({}, 'services');

    const groupedServices = {};

    allBusinesses.forEach((business) => {
      if (Array.isArray(business.services)) {
        business.services.forEach((service) => {
          const family = service.instrumentFamily?.toLowerCase() || 'unknown';
          const group = service.selectedInstrumentsGroup?.toLowerCase() || 'unknown';

          if (!groupedServices[family]) {
            groupedServices[family] = {};
          }

          if (!groupedServices[family][group]) {
            groupedServices[family][group] = [];
          }

          // Only push selected fields
          groupedServices[family][group].push({
            newInstrumentName: service.newInstrumentName,
            pricingType: service.pricingType,
            selectedInstrumentsGroup: service.selectedInstrumentsGroup,
            instrumentFamily: service.instrumentFamily,
          });
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: groupedServices,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.toggleBusinessActive = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "Invalid input. 'isActive' must be a boolean.",
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found.',
      });
    }

    business.isActive = isActive;
    await business.save();

    return res.status(200).json({
      success: true,
      message: `Business ${isActive ? 'activated' : 'deactivated'} successfully.`,
      data: business,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
