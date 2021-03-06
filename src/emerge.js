/*

# Glossary

put               = replace property by key or index, attempting to preserve old references
patch             = combines dicts, preserving old references where possible
merge             = deep patch that combines dicts at all levels
nil               = null | undefined
value             = primitive | list | plain dict


# Internal glossary

assoc = insert value at key or path without attempting to preserve references
        (weaker than put or patch)


# Rules

When making new values, omit nil properties.

Treat non-value objects atomically: include and replace them entirely,
without cloning.


# Performance notes

Emerge seeks a balance of performance and simplicity.

`put`, `patch` and other functions tend to speculatively create a new data
structure before testing it for equality, possibly throwing it away. Should
revisit the code and avoid this, where possible.

`putIn` could be defined as recursive `put`, but would be significantly
slower due to redundant equality checks on every level. Instead, we put
and check once, then assoc faster.

`putBy` and `putInBy` use a fixed number of extra arguments to avoid the
rest/spread overhead, which for small inputs is comparable to the actual work
done by these functions. Native rest/spread would have acceptable performance,
but we're targeting ES5.


# TODO

Add benchmarks with large real-world data.

*/

// Minifiable aliases
const Object_ = Object
const getKeys = Object_.keys
const NOP     = Object.prototype
const has     = NOP.hasOwnProperty
const Array_  = Array
const NAP     = Array_.prototype

/**
 * Boolean
 */

export function is(one, other) {
  return one === other || (isNaN(one) && isNaN(other))
}

export function equal(one, other) {
  return equalBy(other, one, equal)
}

export function equalBy(one, other, fun) {
  validate(fun, isFunction)
  return is(one, other) || (
    isArray(one)
    ? isArray(other) && everyListPairBy(one, other, fun)
    : isDict(one)
    ? isDict(other) && everyDictPairBy(one, other, fun)
    : false
  )
}

/**
 * Get
 */

export function get(value, key) {
  return value == null ? undefined : value[key]
}

export function getIn(value, path) {
  validate(path, isArray)
  for (let i = 0; i < path.length; i += 1) value = get(value, path[i])
  return value
}

export function scan(value) {
  for (let i = 1; i < arguments.length; i += 1) value = get(value, arguments[i])
  return value
}

/**
 * Update
 */

export function put(prev, key, value) {
  validate(key, isPrimitive)
  return assoc(prev, key, putAny(get(prev, key), value))
}

export function putIn(prev, path, next) {
  validate(path, isPath)
  return assocIn(prev, path, putAny(getIn(prev, path), next))
}

export function putBy(prev, key, fun, a, b, c, d, e, f, g, h, i, j) {
  validate(fun, isFunction)
  return put(prev, key, fun(get(prev, key), a, b, c, d, e, f, g, h, i, j))
}

export function putInBy(prev, path, fun, a, b, c, d, e, f, g, h, i, j) {
  validate(fun, isFunction)
  return putIn(prev, path, fun(getIn(prev, path), a, b, c, d, e, f, g, h, i, j))
}

export function patch(prev, next) {
  if (arguments.length > 2) return NAP.reduce.call(arguments, patchTwoDicts)
  return patchTwoDicts(prev, next)
}

export function merge(prev, next) {
  if (arguments.length > 2) return NAP.reduce.call(arguments, mergeTwoDicts)
  return mergeTwoDicts(prev, next)
}

export function insertAtIndex(list, index, value) {
  list = alwaysArray(list)
  validateBounds(list, index)
  list = NAP.slice.call(list)
  list.splice(index, 0, value)
  return list
}

export function removeAtIndex(list, index) {
  validate(index, isInteger)
  list = alwaysArray(list)
  if (isNatural(index) && index < list.length) {
    list = NAP.slice.call(list)
    list.splice(index, 1)
  }
  return list
}

/**
 * Update (internal)
 */

function putAny(prev, next) {
  return (
    is(prev, next)
    ? prev
    : isArray(prev)
    ? (isArray(next) ? replaceListBy(prev, next, putAny) : next)
    : isDict(prev)
    ? (isDict(next) ? replaceDictBy(prev, next, putAny) : next)
    : next
  )
}

function patchTwoDicts(prev, next) {
  prev = alwaysDict(prev)
  next = alwaysDict(next)
  if (is(prev, next)) return prev
  return patchDictBy(prev, next, putAny)
}

function mergeTwoDicts(prev, next) {
  return mergeTwo(alwaysDict(prev), alwaysDict(next))
}

function mergeTwo(prev, next) {
  if (is(prev, next)) return prev
  return patchDictBy(toDict(prev), toDict(next), mergeOrPut)
}

function mergeOrPut(prev, next) {
  return isDict(next) ? mergeTwo(prev, next) : putAny(prev, next)
}

function assoc(prev, key, next) {
  if (isArray(prev)) return assocAtIndex(prev, key, next)
  return assocAtKey(alwaysDict(prev), key, next)
}

function assocIn(prev, path, next) {
  return !path.length ? next : assocInAt(prev, path, next, 0)
}

function assocInAt(prev, path, next, index) {
  const key = path[index]
  return index < path.length - 1
    ? assoc(prev, key, assocInAt(get(prev, key), path, next, index + 1))
    : assoc(prev, key, next)
}

function assocAtIndex(list, index, value) {
  validateBounds(list, index)
  if (index < list.length && is(list[index], value)) return list
  const out = NAP.slice.call(list)
  out[index] = value
  return out
}

function assocAtKey(dict, key, value) {
  key = toKey(key)
  if (value == null) {
    if (!has.call(dict, key)) return dict
  }
  else if (is(dict[key], value)) {
    return dict
  }
  const out = {}
  const prevKeys = getKeys(dict)
  for (let i = 0; i < prevKeys.length; i += 1) {
    const prevKey = prevKeys[i]
    if (prevKey !== key && dict[prevKey] != null) out[prevKey] = dict[prevKey]
  }
  if (value != null) out[key] = value
  return out
}

function replaceListBy(prev, next, fun) {
  const out = Array_(next.length)
  for (let i = 0; i < next.length; i += 1) out[i] = fun(prev[i], next[i])
  return equalBy(prev, out, is) ? prev : out
}

function replaceDictBy(prev, next, fun) {
  const out = {}
  const nextKeys = getKeys(next)
  for (let i = 0; i < nextKeys.length; i += 1) {
    const key = nextKeys[i]
    const value = fun(prev[key], next[key])
    if (value != null) out[key] = value
  }
  return equalBy(prev, out, is) ? prev : out
}

function patchDictBy(prev, next, fun) {
  const out = {}
  const prevKeys = getKeys(prev)
  for (let i = 0; i < prevKeys.length; i += 1) {
    const key = prevKeys[i]
    if (prev[key] != null && !has.call(next, key)) out[key] = prev[key]
  }
  const nextKeys = getKeys(next)
  for (let i = 0; i < nextKeys.length; i += 1) {
    const key = nextKeys[i]
    const value = fun(prev[key], next[key])
    if (value != null) out[key] = value
  }
  return equalBy(prev, out, is) ? prev : out
}

/**
 * Utils
 */

function isPrimitive(value) {
  return !isObject(value) && !isFunction(value)
}

function isNaN(value) {
  return value !== value  // eslint-disable-line no-self-compare
}

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function isDict(value) {
  if (!isObject(value)) return false
  const proto = Object_.getPrototypeOf(value)
  return proto === null || proto === NOP
}

function isArray(value) {
  return isObject(value) && value instanceof Array_
}

function isFunction(value) {
  return typeof value === 'function'
}

function isInteger(value) {
  return typeof value === 'number' && (value % 1) === 0
}

function isNatural(value) {
  return isInteger(value) && value >= 0
}

function isString(value) {
  return typeof value === 'string'
}

function isPath(value) {
  return isArray(value) && everyBy(value, isPrimitive)
}

function everyListPairBy(one, other, fun) {
  return one.length === other.length && everyBy(one, compareAtIndexBy, other, fun)
}

function compareAtIndexBy(value, index, list, fun) {
  return fun(value, list[index])
}

function everyDictPairBy(one, other, fun) {
  const keys = getKeys(one)
  return (
    keys.length === getKeys(other).length &&
    // Breadth-first check in case a key has been added or removed
    everyBy(keys, hasAt, other) &&
    // Now a depth-first comparison
    everyBy(keys, compareAtKeyBy, fun, one, other)
  )
}

function hasAt(key, _index, dict) {
  return has.call(dict, key)
}

function compareAtKeyBy(key, _index, fun, one, other) {
  return fun(one[key], other[key])
}

function everyBy(list, fun, a, b, c) {
  for (let i = 0; i < list.length; i += 1) {
    if (!fun(list[i], i, a, b, c)) return false
  }
  return true
}

function alwaysArray(value) {
  if (value == null) return []
  validate(value, isArray)
  return value
}

function toDict(value) {
  return isDict(value) ? value : {}
}

function alwaysDict(value) {
  if (value == null) return {}
  validate(value, isDict)
  return value
}

function toKey(value) {
  return typeof value === 'symbol' ? value : String(value)
}

function validateBounds(list, index) {
  validate(index, isNatural)
  if (!(index <= list.length)) {
    throw Error(`Index ${index} out of bounds for length ${list.length}`)
  }
}

function validate(value, test) {
  if (!test(value)) throw Error(`Expected ${show(value)} to satisfy test ${show(test)}`)
}

function show(value) {
  return isFunction(value)
    ? (value.name || value.toString())
    : isArray(value) || isDict(value)
    ? JSON.stringify(value)
    : isString(value)
    ? `"${value}"`
    : String(value)
}
