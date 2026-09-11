// Детерминированный LCG игры: одинаковый сид даёт одинаковое поле и кампанию.
// Math.fround повторяет float-арифметику, на которой строились сиды уровней
WordFallRandom = class WordFallRandom
{
    constructor(seed)
    {
        this.seed = seed >>> 0;
        if (this.seed == 0)
            this.seed = (Math.floor(Math.random()*4294967295) + 1) >>> 0;
    }

    Next01()
    {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return Math.fround(this.seed/4294967296);
    }

    NextInt(maxExclusive)
    {
        return Math.min(Math.trunc(Math.fround(this.Next01()*Math.fround(maxExclusive))), maxExclusive - 1);
    }
};
