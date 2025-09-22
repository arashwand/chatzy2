// A simplified script for Jalaali date conversion without moment.js dependency.
// This file extracts necessary functions from moment-jalaali.js and jalaali-js.

// --- Start: Extracted and simplified jalaali-js logic ---

/*
  Jalaali years starting the 33-year rule.
*/
var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210
    , 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178
]

/*
  Converts a Gregorian date to Jalaali.
*/
function toJalaali(gy, gm, gd) {
    if (Object.prototype.toString.call(gy) === '[object Date]') {
        gd = gy.getDate()
        gm = gy.getMonth() + 1
        gy = gy.getFullYear()
    }
    return d2j(g2d(gy, gm, gd))
}

/*
  This function determines if the Jalaali (Persian) year is
  leap (366-day long) or is the common year (365 days), and
  finds the day in March (Gregorian calendar) of the first
  day of the Jalaali year (jy).
*/
function jalCal(jy, withoutLeap) {
    var bl = breaks.length
        , gy = jy + 621
        , leapJ = -14
        , jp = breaks[0]
        , jm
        , jump
        , leap
        , leapG
        , march
        , n
        , i

    if (jy < jp || jy >= breaks[bl - 1])
        throw new Error('Invalid Jalaali year ' + jy)

    // Find the limiting years for the Jalaali year jy.
    for (i = 1; i < bl; i += 1) {
        jm = breaks[i]
        jump = jm - jp
        if (jy < jm)
            break
        leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
        jp = jm
    }
    n = jy - jp

    // Find the number of leap years from AD 621 to the beginning
    // of the current Jalaali year in the Persian calendar.
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
    if (mod(jump, 33) === 4 && jump - n === 4)
        leapJ += 1

    // And the same in the Gregorian calendar (until the year gy).
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150

    // Determine the Gregorian date of Farvardin the 1st.
    march = 20 + leapJ - leapG

    // return with gy and march when we don't need leap
    if (withoutLeap) return { gy: gy, march: march };

    // Find how many years have passed since the last leap year.
    if (jump - n < 6)
        n = n - jump + div(jump + 4, 33) * 33
    leap = mod(mod(n + 1, 33) - 1, 4)
    if (leap === -1) {
        leap = 4
    }

    return {
        leap: leap
        , gy: gy
        , march: march
    }
}

/*
  Converts a date of the Jalaali calendar to the Julian Day number.
*/
function j2d(jy, jm, jd) {
    var r = jalCal(jy, true)
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

/*
  Converts the Julian Day number to a date in the Jalaali calendar.
*/
function d2j(jdn) {
    var gy = d2g(jdn).gy // Calculate Gregorian year (gy).
        , jy = gy - 621
        , r = jalCal(jy, false)
        , jdn1f = g2d(gy, 3, r.march)
        , jd
        , jm
        , k

    // Find number of days that passed since 1 Farvardin.
    k = jdn - jdn1f
    if (k >= 0) {
        if (k <= 185) {
            // The first 6 months.
            jm = 1 + div(k, 31)
            jd = mod(k, 31) + 1
            return {
                jy: jy
                , jm: jm
                , jd: jd
            }
        } else {
            // The remaining months.
            k -= 186
        }
    } else {
        // Previous Jalaali year.
        jy -= 1
        k += 179
        if (r.leap === 1)
            k += 1
    }
    jm = 7 + div(k, 30)
    jd = mod(k, 30) + 1
    return {
        jy: jy
        , jm: jm
        , jd: jd
    }
}

/*
  Calculates the Julian Day number from Gregorian or Julian
  calendar dates.
*/
function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
        + div(153 * mod(gm + 9, 12) + 2, 5)
        + gd - 34840408
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
    return d
}

/*
  Calculates Gregorian and Julian calendar dates from the Julian Day number.
*/
function d2g(jdn) {
    var j
        , i
        , gd
        , gm
        , gy
    j = 4 * jdn + 139361631
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
    i = div(mod(j, 1461), 4) * 5 + 308
    gd = div(mod(i, 153), 5) + 1
    gm = mod(div(i, 153), 12) + 1
    gy = div(j, 1461) - 100100 + div(8 - gm, 6)
    return {
        gy: gy
        , gm: gm
        , gd: gd
    }
}

/*
  Utility helper functions.
*/
function div(a, b) {
    return ~~(a / b)
}

function mod(a, b) {
    return a - ~~(a / b) * b
}

// --- End: Extracted and simplified jalaali-js logic ---

// --- Localization Data (Simplified from moment-jalaali.js) ---
var jMonths = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

var weekdays = [
    'یک‌شنبه', 'دوشنبه', 'سه شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'
];

// --- Core Conversion Function ---

/**
 * Converts a Gregorian date string (YYYY-MM-DD) to a Jalaali date string
 * in the format "dddd jD jMMMM jYYYY".
 *
 * @param {string} gregorianDateString - The Gregorian date in YYYY-MM-DD format.
 * @returns {string} The Jalaali date string or an error message if invalid.
 */
function convertGregorianToJalaaliSimple(gregorianDateString) {
    // Parse the Gregorian date string
    var parts = gregorianDateString.split('-');
    if (parts.length !== 3) {
        return "تاریخ ورودی نامعتبر است. فرمت صحیح: YYYY-MM-DD";
    }

    var gy = parseInt(parts[0], 10);
    var gm = parseInt(parts[1], 10);
    var gd = parseInt(parts[2], 10);

    // Basic validation for numbers
    if (isNaN(gy) || isNaN(gm) || isNaN(gd)) {
        return "تاریخ ورودی نامعتبر است (شامل اعداد نیست).";
    }

    // Convert Gregorian to Jalaali
    var jalaaliDate;
    try {
        jalaaliDate = toJalaali(gy, gm, gd); // Note: gm here is 1-indexed (month number)
    } catch (e) {
        return "خطا در تبدیل تاریخ: " + e.message;
    }

    // Get the day of the week for the Gregorian date
    var gregorianDateObj = new Date(gy, gm - 1, gd); // Month is 0-indexed for Date object
    var dayOfWeekIndex = gregorianDateObj.getDay(); // 0 for Sunday, 6 for Saturday

    // Format the Jalaali date
    // Adjust jalaaliDate.jm to be 0-indexed for jMonths array
    var formattedJalaaliDate =
        weekdays[dayOfWeekIndex] + ' ' +
        jalaaliDate.jd + ' ' +
        jMonths[jalaaliDate.jm - 1] + ' ' + // کاهش ایندکس ماه
        jalaaliDate.jy;

    return formattedJalaaliDate;
}

// برای دسترسی به تابع از خارج، آن را به window یا module.exports اضافه کنید
// برای استفاده در مرورگر
if (typeof window !== 'undefined') {
    window.convertGregorianToJalaaliSimple = convertGregorianToJalaaliSimple;
}
// برای استفاده در Node.js / CommonJS environment
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = convertGregorianToJalaaliSimple;
}