package main

import "testing"

func TestPeekMetasWithoutFullLoad(t *testing.T) {
	cm := peekCorpusMeta()
	em := peekEmbedMeta()
	if cm.Passages <= 0 {
		t.Fatalf("corpus.meta.json passages=%d", cm.Passages)
	}
	if em.Name == "" && em.Parameters == 0 {
		t.Fatal("embed.meta.json empty")
	}
}

func TestEnsureBrainDataIdempotent(t *testing.T) {
	ensureBrainData()
	ensureBrainData()
	if !brainWarm() {
		t.Fatal("brain still cold after ensureBrainData")
	}
	if corpus == nil || len(corpus.docs) == 0 {
		t.Fatal("corpus empty after ensure")
	}
	if embeddings == nil {
		t.Fatal("embeddings nil after ensure")
	}
}
