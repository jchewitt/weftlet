semantic-id: public:execution
# Execution
The execution workflow is implemented by services/execution/src/execute.ts.
The execution workflow is governed by Execution requires readings at most 60 seconds old.
The execution workflow routes through the notifications workflow using stored readings.
