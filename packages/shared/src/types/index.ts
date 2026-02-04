export type Operations =
  | "eq" // equal to (e.g., column=eq.value)
  | "neq" // not equal to
  | "gt" // greater than
  | "gte" // greater than or equal to
  | "lt" // less than
  | "lte" // less than or equal to
  | "like" // LIKE pattern match (case-sensitive, `%` as wildcard)
  | "ilike" // ILIKE pattern match (case-insensitive)
  | "is" // IS operator (commonly used with NULL, e.g., column=is.null)
  | "in" // matches any in a comma-separated list (e.g., id=in.(1,2,3))
  | "cs" // contains — array contains value(s)
  | "cd" // contained in — array is contained by value(s)
  | "ov" // overlaps
  | "not.ov"
  | "not.eq" // equal to (e.g., column=eq.value)
  | "not.neq" // not equal to
  | "not.gt" // greater than
  | "not.gte" // greater than or equal to
  | "not.lt" // less than
  | "not.lte" // less than or equal to
  | "not.like" // LIKE pattern match (case-sensitive, `%` as wildcard)
  | "not.ilike" // ILIKE pattern match (case-insensitive)
  | "not.is" // IS operator (commonly used with NULL, e.g., column=is.null)
  | "not.in" // matches any in a comma-separated list (e.g., id=in.(1,2,3))
  | "not.cs" // contains — array contains value(s)
  | "not.cd"; // contained in — array is contained by value(s)
