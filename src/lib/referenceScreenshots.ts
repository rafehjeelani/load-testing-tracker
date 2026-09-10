import networkCheck from "../assets/reference-screenshots/network-check.jpg";
import sessionJoined from "../assets/reference-screenshots/session-joined.jpg";
import consentGiven from "../assets/reference-screenshots/consent-given.png";
import audioFaceShared from "../assets/reference-screenshots/audio-face-shared.jpg";
import screenShared from "../assets/reference-screenshots/screen-shared.jpg";
import secondaryDeviceConnected from "../assets/reference-screenshots/secondary-device-connected.jpg";
import envCaptured from "../assets/reference-screenshots/env-captured.jpg";
import idCheckCaptured from "../assets/reference-screenshots/id-check-captured.jpg";
import onboardingCompleted from "../assets/reference-screenshots/onboarding-completed.jpg";
import assessment from "../assets/reference-screenshots/assessment.png";
import sessionCompleted from "../assets/reference-screenshots/session-completed.png";

export interface ReferenceScreenshot {
  src: string;
  /** What the screenshot must show, so the candidate can match it. */
  caption: string;
}

/** Keyed by the step's exact name -- matches the standard step list every
 *  new test is seeded with (see STANDARD_STEPS in staffApi.ts). A test
 *  whose steps were renamed or customized simply won't have a reference
 *  image for the steps that no longer match; that's expected, not an error. */
export const REFERENCE_SCREENSHOTS: Record<string, ReferenceScreenshot> = {
  "Network Check": {
    src: networkCheck,
    caption: "Completed speed-test page with download and upload speeds visible.",
  },
  "Session Joined": {
    src: sessionJoined,
    caption: "The consent-start (Recording & Privacy) screen, loaded successfully.",
  },
  "Consent Given": {
    src: consentGiven,
    caption: "Any onboarding instruction screen shown immediately after accepting consent.",
  },
  "Audio detected": {
    src: audioFaceShared,
    caption: "The Share Screen instruction page with the candidate camera tile visible.",
  },
  "Face Captured": {
    src: audioFaceShared,
    caption: "The Share Screen instruction page with the candidate camera tile visible (same screenshot as Audio detected).",
  },
  "Screen Shared": {
    src: screenShared,
    caption: "The Connect Secondary Device QR-code page, with the active screen-sharing indicator.",
  },
  "Secondary device connected": {
    src: secondaryDeviceConnected,
    caption: "The \"Device connected\" confirmation, candidate camera tile, and active screen-sharing indicator.",
  },
  "360 env captured": {
    src: envCaptured,
    caption: "The Photo ID Check instruction screen, confirming environment capture is complete.",
  },
  "Id check captured": {
    src: idCheckCaptured,
    caption: "The \"Position your smartphone or tablet\" orientation screen.",
  },
  "Onboarding Completed (Orientation check Submitted)": {
    src: onboardingCompleted,
    caption: "The \"Onboarding checks completed\" message and Start Session button.",
  },
  Assessment: {
    src: assessment,
    caption: "Assessment questions, timer, and controls visible.",
  },
  "Session Completed": {
    src: sessionCompleted,
    caption: "The \"Session Completed\" confirmation message.",
  },
};
