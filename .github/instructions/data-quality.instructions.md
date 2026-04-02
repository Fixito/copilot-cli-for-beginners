---
description: This file describes the data quality standards for JSON files in the project.
applyTo: '**/*.json'
---

# Data Quality Guidelines

## General Guidelines

- Ensure that all JSON files are well-formed and valid according to the JSON specification.
- Use consistent formatting, such as indentation and spacing, to improve readability.
- Avoid using comments in JSON files, as they are not supported by the JSON specification.
- Use descriptive keys that clearly indicate the purpose of the data they represent.
- Ensure that all required fields are present and contain valid data.
- Avoid using null values; instead, use undefined or omit the key entirely if the value is not applicable.
- Use arrays for lists of items and objects for structured data.

## Validation

- Use JSON Schema to define the structure and constraints of your JSON data, and validate your JSON files against the schema to ensure they meet the required standards.
- Regularly review and update the JSON Schema as the data requirements evolve.

## User interactions

- Ask questions if you are unsure about the data structure, required fields, or any specific constraints that should be applied to the JSON data.
- Always answer in the same language as the question, but use English for the generated content like code, comments, or documentation.
