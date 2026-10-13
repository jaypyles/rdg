# Agent guidelines

## Formatting

Put a blank line between logical blocks of code inside functions (setup, early returns, work steps, cleanup). Do not pack unrelated steps back-to-back.

```ts
// ❌ BAD
const stop = (id: string): boolean => {
  const task = tasks.get(id);
  if (!task) {
    return false;
  }
  clearTimers(task);
  tasks.delete(id);
  return true;
};

// ✅ GOOD
const stop = (id: string): boolean => {
  const task = tasks.get(id);

  if (!task) {
    return false;
  }

  clearTimers(task);
  tasks.delete(id);

  return true;
};
```
