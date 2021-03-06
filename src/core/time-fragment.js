/**
 * Copyright 2015 CANAL+ Group
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import assert from "../utils/assert";

/**
 * Parse multiple formats of timeFragments for start and end to either:
 *   - percentages
 *   - time numbers in seconds
 *   - Date Objects
 * @param {string|Object} timeFragment
 * @returns {Object}
 */
function parseTimeFragment(timeFragment) {
  if (typeof timeFragment == "string") {
    timeFragment = temporalMediaFragmentParser(timeFragment);
  } else if (!timeFragment) {
    timeFragment = {};
  }

  // string timeFragment are percentages
  if (typeof timeFragment.start == "string" &&
      typeof timeFragment.end == "string") {
    if (!timeFragment.start) {
      timeFragment.start = "0%";
    }
    if (!timeFragment.end) {
      timeFragment.end = "100%";
    }
  }
  else { // Number / Date
    if (!timeFragment.start) {
      timeFragment.start = 0;
    }
    if (!timeFragment.end) {
      timeFragment.end = Infinity;
    }
  }

  if (typeof timeFragment.start == "string" &&
      typeof timeFragment.end == "string") {
    assert(
      (parseFloat(timeFragment.start) >= 0 && parseFloat(timeFragment.start) <= 100),
      "player: startTime should be between 0% and 100%");
    assert(
      (parseFloat(timeFragment.end) >= 0 && parseFloat(timeFragment.end) <= 100),
      "player: endTime should be between 0% and 100%");
  }
  else {
    assert(
      (typeof timeFragment.start == "number" || timeFragment.start instanceof Date) &&
      (typeof timeFragment.end == "number" || timeFragment.end instanceof Date),
      "player: timeFragment should have interface { start, end } where start and end are numbers or dates");
    assert(timeFragment.start < timeFragment.end, "player: startTime should be lower than endTime");
    assert(timeFragment.start >= 0, "player: startTime should be greater than 0");
  }

  return timeFragment;
}

const errMessage = "invalid MediaFragment";

/**
 * Convert NPT (normal play time - RFC2326) into seconds.
 * @param {string} time
 * @returns {Number}
 */
function normalizeNPTTime(time) {
  if (!time) {
    return false;
  }

  // replace a sole trailing dot, which is legal:
  // npt-sec = 1*DIGIT [ "." *DIGIT ]
  time = time.replace(/\.$/, "");

  // possible cases:
  // 12:34:56.789
  //    34:56.789
  //       56.789
  //       56
  let hours;
  let minutes;
  let seconds;
  time = time.split(":");
  const length = time.length;
  switch(length) {
  case 3:
    hours = parseInt(time[0], 10);
    minutes = parseInt(time[1], 10);
    seconds = parseFloat(time[2]);
    break;
  case 2:
    hours = 0;
    minutes = parseInt(time[0], 10);
    seconds = parseFloat(time[1]);
    break;
  case 1:
    hours = 0;
    minutes = 0;
    seconds = parseFloat(time[0]);
    break;
  default:
    return false;
  }
  assert(hours <= 23, errMessage);
  assert(minutes <= 59, errMessage);
  assert(length <= 1 || seconds < 60, errMessage);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Convert SMPTE timecode to seconds.
 * (https://en.wikipedia.org/wiki/SMPTE_timecode)
 *
 * We interpret frames as milliseconds, and further-subdivison-of-frames
 * as microseconds. this allows for relatively easy comparison.
 * @param {string} time
 * @returns {Number|Boolean} - time in seconds. Boolean if not valid.
 */
function normalizeSMPTETime(time) {
  if (!time) {
    return false;
  }

  // possible cases:
  // 12:34:56
  // 12:34:56:78
  // 12:34:56:78.90
  let hours;
  let minutes;
  let seconds;
  let frames;
  let subframes;
  time = time.split(":");
  const length = time.length;
  switch(length) {
  case 3:
    hours = parseInt(time[0], 10);
    minutes = parseInt(time[1], 10);
    seconds = parseInt(time[2], 10);
    frames = 0;
    subframes = 0;
    break;
  case 4:
    hours = parseInt(time[0], 10);
    minutes = parseInt(time[1], 10);
    seconds = parseInt(time[2], 10);
    if (time[3].indexOf(".") === -1) {
      frames = parseInt(time[3], 10);
      subframes = 0;
    } else {
      const frameSubFrame = time[3].split(".");
      frames = parseInt(frameSubFrame[0], 10);
      subframes = parseInt(frameSubFrame[1], 10);
    }
    break;
  default:
    return false;
  }
  assert(hours <= 23, errMessage);
  assert(minutes <= 59, errMessage);
  assert(seconds <= 59, errMessage);
  return hours * 3600 + minutes * 60 + seconds +
      frames * 0.001 + subframes * 0.000001;
}

/**
 * Convert ISO8601 to a Date Object.
 * XXX Returning a Date leads to some undefined behavior down the code
 * where a Number is expected.
 * @param {string} time
 * @returns {Date}
 */
function normalizeWallClockTime(time) {
  // Date.parse already understand ISO 8601, thankfully
  return new Date(Date.parse(time));
}

/**
 * Convert percentage string into... the same percentage string.
 * False if empty string.
 * @param {string} time
 * @returns {string|Boolean}
 */
function normalizePercentage(time) {
  if (!time) {
    return false;
  }

  return time;
}

/*
 * MediaFragment temporal parser.
 * adapted from: https://github.com/tomayac/Media-Fragments-URI
 * specification: http://www.w3.org/TR/media-frags/#naming-time
 * @param {string} value
 * @returns {Object}
 */
function temporalMediaFragmentParser(value) {
  const components = value.split(",");
  assert(components.length <= 2, errMessage);

  let start = components[0] ? components[0] : "";
  let end = components[1] ? components[1] : "";
  assert((start || end) && (!start || end || value.indexOf(",") === -1),
         errMessage);

  start = start
    .replace(/^smpte(-25|-30|-30-drop)?:/, "") // remove smpte prefix
    .replace(/^npt[:=]/, "") // remove npt prefix
    .replace("clock:", ""); // remove clock prefix

  // Normal Play Time, as specified in the RFC2326
  // Examples:
  // 123:45:47.7878 -> hours:minutes:seconds.milliseconds
  // 123:45:47 -> hours:minutes:seconds
  // 45:47.887 -> minutes:seconds.milliseconds
  // 2254 -> just seconds
  // 0.487 -> 487 milliseconds
  const npt = /(((\d+:)?(\d\d):(\d\d))|(\d+))(\.\d*)?$/;

  // SMPTE Format.
  // Examples:
  // 123:45:47:12.9 -> hours:minutes:seconds:frames.subdivison-of-frames
  const smpte = /^\d+:\d\d:\d\d(:\d\d(\.\d\d)?)?$/;

  // ISO8601 regExp - Should specify at least to the second.
  // Examples:
  // 2017-03-23T15:09:17
  // 2017-03-23T15:09:17Z
  // 2017-03-23T17:07:46+01:00
  // 2017-03-23T17:07:46-01:00
  const wallClock =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|([-+]\d{2}:\d{2}))?$/;

  // Pecentages
  // Examples:
  // 80 %
  // 80%
  // 32.12324 %
  // 32.12324%
  // .8787%
  const percentage = /^\d*(\.\d+)? ?%$/;

  // "normalize" time by understanding its format
  let timeNormalizer;
  if (npt.test(start) && npt.test(end)) {
    timeNormalizer = normalizeNPTTime;
  }
  else if (smpte.test(start) && smpte.test(end)) {
    timeNormalizer = normalizeSMPTETime;
  }
  else if (wallClock.test(start) && wallClock.test(end)) {
    timeNormalizer = normalizeWallClockTime;
  }
  else if (percentage.test(start) && percentage.test(end)) {
    timeNormalizer = normalizePercentage;
  }
  else {
    throw new Error(errMessage);
  }

  start = timeNormalizer(start);
  end = timeNormalizer(end);
  assert((start !== false) || (end !== false), errMessage);
  return {
    start: start === false ? "" : start,
    end: end === false ? "" : end,
  };
}

export { parseTimeFragment };
