export class Eligibility {
  allow(age: number) { return age >= 18; }
  label() { return "eligibility"; }
}
