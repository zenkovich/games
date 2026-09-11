// Тестовый API для *.test.js: test(name, body) регистрирует тест, expect* копят
// провалы и не прерывают тест, assert прерывает. Запускает JsTestsRunner.cpp
JsTests = { suites: {}, current: null, failures: [] };

test = function(name, body)
{
    JsTests.current[name] = body;
};

JsTestsFormat = function(value)
{
    try { return JSON.stringify(value); }
    catch (e) { return String(value); }
};

// Строка вызова expect в тесте: провал показывает, где он случился
JsTestsWhere = function()
{
    var lines = String(new Error().stack || "").split("\n");
    return lines.length > 3 ? " (" + lines[3].trim() + ")" : "";
};

JsTestsFail = function(message)
{
    JsTests.failures.push(message + JsTestsWhere());
};

expect = function(condition, message)
{
    if (!condition)
        JsTestsFail(message || "expectation failed");
    return !!condition;
};

expectEq = function(actual, expected, message)
{
    var a = JsTestsFormat(actual);
    var e = JsTestsFormat(expected);
    if (a !== e)
        JsTestsFail((message ? message + ": " : "") + "expected " + e + ", got " + a);
    return a === e;
};

expectNear = function(actual, expected, tolerance, message)
{
    var ok = Math.abs(actual - expected) <= tolerance;
    if (!ok)
        JsTestsFail((message ? message + ": " : "") + "expected " + expected + " ± " + tolerance + ", got " + actual);
    return ok;
};

assert = function(condition, message)
{
    if (!condition)
        throw new Error(message || "assertion failed");
};
