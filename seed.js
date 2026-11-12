// Placeholder prints so the layout can be judged before places.js is ready.
// All four use one known-good embed (downtown Mill Valley, March 2008).
(function () {
  var MV = "https://www.google.com/maps/embed?pb=!4v1794502893934!6m8!1m7!1sVxa1GiQHm8gW37SaOmmzLA!2m2!1d37.90625804254552!2d-122.5477732402157!3f0!4f0!5f0.7820865974627469";
  var SEED = [
    {
      id: "mv-parking", town: "Mill Valley", name: "Downtown Mill Valley",
      embedSrc: MV, captureDate: "2008-03",
      headline: "Open Parking Spot Reportedly Seen in Mill Valley in 2008",
      dek: "Witnesses could not agree on which block.",
      then: "Bad parking.", now: "Bad parking, with an app.",
      sources: [], verifiedOn: "", status: "placeholder"
    },
    {
      id: "ross-hedge", town: "Ross", name: "A hedge in Ross",
      embedSrc: MV, captureDate: "2008-03",
      headline: "Ross Hedge Enters Fourth Decade of Successfully Hiding House",
      dek: "",
      then: "Hedge.", now: "Taller hedge.",
      sources: [], verifiedOn: "", status: "placeholder"
    },
    {
      id: "fairfax-unchanged", town: "Fairfax", name: "Downtown Fairfax",
      embedSrc: MV, captureDate: "2008-03",
      headline: "Fairfax Unchanged, Sources Confirm",
      dek: "Sources asked to be identified only as “the guy outside the Coffee Roastery.”",
      then: "Fairfax.", now: "Fairfax.",
      sources: [], verifiedOn: "", status: "placeholder"
    },
    {
      id: "longs", town: "San Rafael", name: "Longs Drugs",
      embedSrc: MV, captureDate: "2008-03",
      headline: "Area Mom Still Calls It Longs",
      dek: "",
      then: "Longs.", now: "CVS.",
      sources: [], verifiedOn: "", status: "placeholder"
    }
  ];
  // Every seed reuses the same embed for "now" so the time flip can be judged.
  SEED.forEach(function (p) { p.nowEmbedSrc = MV; });
  // Demo the two gags on the placeholders.
  SEED[1].gag = { type: "locked", text: "This channel is not part of your package. Contact the Town of Ross." };
  SEED[2].gag = { type: "unlisted" };
  window.SEED_PLACES = SEED;
})();
