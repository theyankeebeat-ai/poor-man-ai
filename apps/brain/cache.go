package main

import "sync/atomic"

var cacheHits atomic.Int64
var cacheMisses atomic.Int64

func hitRate() float64 {
	h := cacheHits.Load()
	m := cacheMisses.Load()
	if h+m == 0 {
		return 0
	}
	return float64(h) / float64(h+m)
}

func noteCache(hit bool) {
	if hit {
		cacheHits.Add(1)
		return
	}
	cacheMisses.Add(1)
}
