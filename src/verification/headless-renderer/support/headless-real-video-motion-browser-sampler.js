window.__shortforgeSampleMotionHashes = async function sampleMotionHashes(
  videoUrl,
  seekTimesSec,
  evaluateTimeoutMs,
  waitForFreshDecode,
) {
  if (waitForFreshDecode === undefined) {
    waitForFreshDecode = true;
  }
  function hashRegion(imageData) {
    var bytes = Array.from(imageData);
    var h = 2166136261;
    for (var i = 0; i < bytes.length; i += 1) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function waitDecoded(video, expectedSec, toleranceSec) {
    return new Promise(function (resolveWait) {
      var matches = function (mediaTime) {
        var observed =
          typeof mediaTime === "number" && Number.isFinite(mediaTime)
            ? mediaTime
            : video.currentTime;
        return video.readyState >= 2 && Math.abs(observed - expectedSec) <= toleranceSec;
      };
      if (matches()) {
        resolveWait(true);
        return;
      }
      if (typeof video.requestVideoFrameCallback !== "function") {
        resolveWait(matches());
        return;
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolveWait(matches());
      }, evaluateTimeoutMs);
      video.requestVideoFrameCallback(function (_now, metadata) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveWait(matches(metadata && metadata.mediaTime));
      });
    });
  }

  var video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;
  document.body.appendChild(video);
  await new Promise(function (resolveLoad, rejectLoad) {
    var timer = setTimeout(function () {
      rejectLoad(new Error("video load timeout"));
    }, evaluateTimeoutMs);
    video.addEventListener(
      "loadedmetadata",
      function () {
        clearTimeout(timer);
        resolveLoad();
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      function () {
        clearTimeout(timer);
        rejectLoad(new Error("video load failed"));
      },
      { once: true },
    );
  });

  var toleranceSec = 0.5 / 30;
  var hashes = [];
  for (var i = 0; i < seekTimesSec.length; i += 1) {
    var seekSec = seekTimesSec[i];
    await new Promise(function (resolveSeek, rejectSeek) {
      var timer = setTimeout(function () {
        rejectSeek(new Error("seek timeout"));
      }, evaluateTimeoutMs);
      video.addEventListener(
        "seeked",
        function () {
          clearTimeout(timer);
          resolveSeek();
        },
        { once: true },
      );
      video.currentTime = seekSec;
    });
    var decoded = true;
    if (waitForFreshDecode) {
      decoded = await waitDecoded(video, seekSec, toleranceSec);
      if (!decoded) {
        throw new Error("decode failed at " + String(seekSec));
      }
    }
    var canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas unavailable");
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var insetX = Math.floor(canvas.width * 0.1);
    var insetY = Math.floor(canvas.height * 0.1);
    var region = ctx.getImageData(
      insetX,
      insetY,
      canvas.width - insetX * 2,
      canvas.height - insetY * 2,
    );
    hashes.push(hashRegion(region.data));
  }
  return hashes;
};
