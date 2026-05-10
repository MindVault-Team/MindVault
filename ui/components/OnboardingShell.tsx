import { useMemo, useState } from "react";

type OnboardingShellProps = {
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
  busy: boolean;
  errorMessage: string | null;
};

const STEPS = ["Basics", "LLM setup", "Review", "Done"] as const;

function stepDescription(step: number): string {
  switch (step) {
    case 0:
      return "Basics placeholder: a short fixed Q&A (who you are, what you use MindVault for, interests, work context). No chat interview — just answers in simple fields.";
    case 1:
      return "LLM setup placeholder: choose provider (Ollama / LM Studio), endpoint, and model — same settings the app uses later. Required before the bundled Onboarding Agent can extract Nodes from your answers.";
    case 2:
      return "Review placeholder: inspect, edit, or remove proposed Nodes from the Onboarding Agent before anything is saved. Optional paste-import can merge here.";
    default:
      return "Done placeholder: confirm and open the main MindVault canvas.";
  }
}

function OnboardingShell({ onComplete, onSkip, busy, errorMessage }: OnboardingShellProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === STEPS.length - 1;

  const heading = useMemo(() => `${currentStep + 1}. ${STEPS[currentStep]}`, [currentStep]);

  function goBack() {
    setCurrentStep((value) => Math.max(0, value - 1));
  }

  function goNext() {
    setCurrentStep((value) => Math.min(STEPS.length - 1, value + 1));
  }

  return (
    <section className="onboarding-shell" aria-label="Onboarding wizard">
      <div className="onboarding-card">
        <header className="onboarding-header">
          <div>
            <p className="onboarding-eyebrow">First Run Setup</p>
            <h1>Welcome to MindVault</h1>
          </div>
          <button
            type="button"
            className="onboarding-skip"
            onClick={() => void onSkip()}
            disabled={busy}
          >
            Skip onboarding
          </button>
        </header>

        <ol className="onboarding-stepper">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className={`onboarding-step ${index === currentStep ? "active" : ""} ${index < currentStep ? "done" : ""}`}
            >
              <span>{index + 1}</span>
              <small>{step}</small>
            </li>
          ))}
        </ol>

        <div className="onboarding-content">
          <h2>{heading}</h2>
          <p>{stepDescription(currentStep)}</p>
          {errorMessage ? <p className="onboarding-error">{errorMessage}</p> : null}
        </div>

        <footer className="onboarding-actions">
          <button type="button" onClick={goBack} disabled={currentStep === 0 || busy}>
            Back
          </button>
          {isLastStep ? (
            <button
              type="button"
              className="primary"
              onClick={() => void onComplete()}
              disabled={busy}
            >
              Finish onboarding
            </button>
          ) : (
            <button type="button" className="primary" onClick={goNext} disabled={busy}>
              Next
            </button>
          )}
        </footer>
      </div>
    </section>
  );
}

export default OnboardingShell;
