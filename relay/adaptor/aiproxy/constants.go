package aiproxy

import "github.com/neo-matrix/neo-matrix/relay/adaptor/openai"

var ModelList = []string{""}

func init() {
	ModelList = openai.ModelList
}
