package main

import "testing"

func TestTryMath(t *testing.T) {
	cases := []struct {
		in, out string
		ok      bool
	}{
		{"2 plus 2", "2+2 = **4**.", true},
		{"what is 10 divided by 4?", "10/4 = **2.5**.", true},
		{"2+2*3", "2+2*3 = **8**.", true},
		{"7/2. Reply with just the number.", "3.5", true},
		{"2plus2", "", false},
		{"2 plus two", "", false},
		{"what is the weather in Austin", "", false},
	}
	for _, tc := range cases {
		got, ok := tryMath(tc.in)
		if ok != tc.ok || got != tc.out {
			t.Errorf("%q -> (%q, %v), want (%q, %v)", tc.in, got, ok, tc.out, tc.ok)
		}
	}
}

func TestAskPartsDropsGreeting(t *testing.T) {
	parts := askParts("hello! is anthropic going ipo? then what happened in serbia?")
	if len(parts) != 2 {
		t.Fatalf("parts = %#v", parts)
	}
	if parts[0] != "is anthropic going ipo" || parts[1] != "what happened in serbia" {
		t.Fatalf("parts = %#v", parts)
	}
	if got := askParts("hi"); len(got) != 1 || got[0] != "hi" {
		t.Fatalf("greeting = %#v", got)
	}
}
