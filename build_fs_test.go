package main

import "testing"

func TestBuildFSIncludesPlaceholderWithoutFrontend(t *testing.T) {
	body, err := buildFS.ReadFile("web/build/placeholder")
	if err != nil {
		t.Fatalf("read embedded placeholder: %v", err)
	}
	if len(body) == 0 {
		t.Fatal("embedded placeholder is empty")
	}
}
