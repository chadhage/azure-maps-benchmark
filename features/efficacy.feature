Feature: Evidence-led Azure Maps efficacy evaluation
  As a Cloud Solution Architect
  I want reproducible measurements against independent expected answers
  So that I do not mistake provider confidence or demo fixtures for efficacy

  Scenario: Mixed labels have honest accuracy denominators
    Given the invented mixed-label sample dataset
    When I evaluate both search strategies offline
    Then there are 16 observations and 12 labelled observations
    And top-1 correctness is 50 percent
    And candidate coverage is 68.75 percent
    And the report clearly says that evidence is simulated
    And no paid HTTP attempts have occurred

  Scenario: A high-confidence candidate can still be incorrect
    Given an expected street of "100 Example St"
    When the provider returns "999 Wrong St" with high confidence
    Then top-1 correctness is false

  Scenario: A lower-ranked correct match is not a top-1 success
    Given an expected street of "100 Example St"
    When an incorrect candidate precedes the correct candidate
    Then top-1 correctness is false
    And top-k correctness is true

  Scenario: Unlabelled addresses cannot inflate automated accuracy
    Given an unlabelled address
    When a plausible candidate is returned
    Then automated correctness is not measured

  Scenario: Aggregate exports do not expose input addresses
    Given the invented mixed-label sample dataset
    When I evaluate both search strategies offline
    And I export with default privacy settings
    Then no query text or case evidence is present
