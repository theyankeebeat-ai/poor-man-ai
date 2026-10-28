---
name: statistics
topics: [statistics, standard deviation, variance, median, histogram, null hypothesis, normal distribution, interquartile, sample variance, z-score, interquartile range]
---

# Statistics

**Scope:** Introductory statistics for center and spread, and for reading a histogram, a normal distribution, or a null hypothesis without overclaiming.

## Method

1. Define the question in measurable terms.
2. Name the units of every variable.
3. Say whether the numbers are a sample or the whole population.
4. Choose the statistic that answers the question.
5. Compute it with the sample formula or the population formula, not a mix.
6. State the caveat: a histogram, a normal curve, or a null hypothesis does not by itself prove the claim.

## Formulas

- **Sample mean:** x̄ = Σx / n. The arithmetic average of the n observed sample values.
- **Sample median:** the middle ordered value; if n is even, average the two middle values. A center that extreme values pull less than they pull the mean.
- **Sample variance:** s^2 = Σ(x - x̄)^2 / (n - 1). Sample variance divides by n-1, the usual sample estimate of population spread.
- **Population variance:** σ^2 = Σ(x - μ)^2 / N. Population variance divides by N, the population size, not by n-1.
- **Sample standard deviation:** s = sqrt(s^2). The square root of the sample variance, back in the original units.
- **z-score:** z = (x - μ) / σ. How many population standard deviations x lies from the population mean μ.
- **Interquartile range:** IQR = Q3 - Q1. The spread of the middle half; state the quartile rule because textbooks split halves differently.

## Checks

- Sample variance divides by n-1, and population variance divides by N.
- Order the values before the median, Q1, Q3, or the interquartile range.
- This z-score uses population μ and σ, not the sample mean and s.
- Read a histogram as counts in chosen bins, not as proof of a normal distribution.

## Limits

- Swapping the N divisor and the n-1 divisor is incorrect.
- A bell-shaped histogram does not prove a normal distribution.
- Failing to reject a null hypothesis is not proof that the null hypothesis is true.
